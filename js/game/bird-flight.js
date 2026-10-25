import * as THREE from 'three';
import { SCENE_PROPS, getHabitatArea } from '../config/index.js';
import { FlightCollisionWorld, moveFlightSphere, sphereIntersectsBox } from '../core/flight-collision.js';
import { cloneAnimationClip, resolveAnimationClip } from '../props/model-animation.js';
import { clampMovementAxis } from '../utils/player-motion.js';
import { stepFlightMotion } from '../utils/flight-motion.js';

const ANIMATION_ENVELOPE_SAMPLES = 64;

export function isBirdRewardUnlocked(checklist) {
  return Number(checklist?.total) > 0 && checklist.completed === checklist.total;
}

export class BirdFlight {
  constructor(app, tuning, { extraObstacles = [] } = {}) {
    this.app = app;
    this.config = tuning;
    this.model = app.modelProps.bird;
    this.obstacles = extraObstacles;
    this.collision = new FlightCollisionWorld();
    this.active = false;
    this.suspended = false;
    this.paused = false;
    this.ready = false;
    this.debug = false;
    this.input = { keys: new Set(), x: 0, y: 0 };
    this.motion = { axes: { x: 0, y: 0, magnitude: 0 }, yaw: 0, speed: 0, verticalSpeed: 0, pitch: 0, bank: 0 };
    this.position = new THREE.Vector3();
    this.displacement = new THREE.Vector3();
    this.candidate = new THREE.Vector3();
    this.cameraForward = new THREE.Vector3();
    this.cameraOffset = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.cameraDelta = new THREE.Vector3();
    this.antPosition = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.halfSize = getHabitatArea(app.settings.area).detailSize * 0.5;
    this.resolveCandidate = (position) => this.resolveMovementCandidate(position);
  }

  async start() {
    if (this.ready) return;
    this.model ??= await this.app.loadDeferredModel('bird');
    if (this.disposed) return;
    if (!this.model) throw new Error('The playable bird model is missing.');
    const recipe = SCENE_PROPS.bird.animation;
    const source = resolveAnimationClip(this.model.animations, recipe.clip);
    if (!source) throw new Error('The playable bird flight animation is missing.');
    const clip = cloneAnimationClip(source, { removeTracks: recipe.removeTracks });
    this.mixer = new THREE.AnimationMixer(this.model.group);
    this.action = this.mixer.clipAction(clip);
    this.action.play();
    // Measure the complete wing cycle once so its sphere covers the animated wings.
    const envelope = new THREE.Box3().makeEmpty();
    const sample = new THREE.Box3();
    this.model.group.scale.setScalar(1);
    for (let index = 0; index <= ANIMATION_ENVELOPE_SAMPLES; index += 1) {
      this.mixer.setTime(clip.duration * index / ANIMATION_ENVELOPE_SAMPLES);
      this.model.group.updateWorldMatrix(true, true);
      envelope.union(sample.setFromObject(this.model.group, true));
      if (index % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.disposed) return;
    }
    const size = envelope.getSize(new THREE.Vector3());
    const center = envelope.getCenter(new THREE.Vector3());
    this.model.group.children[0].position.sub(center);
    const scale = SCENE_PROPS.bird.targetWidth / Math.max(size.x, size.z);
    this.model.group.scale.setScalar(scale);
    this.radius = size.length() * scale * 0.5 + 0.04;
    this.action.timeScale = recipe.speed;
    this.mixer.setTime(0);
    this.model.group.visible = false;
    const sources = [...this.app.getFlightCollisionSources(), ...this.obstacles.map((object) => ({ object }))];
    for (const source of sources) {
      if (source.branches) this.collision.addBranches(source.object, source.branches);
      else this.collision.addObject(source.object);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.disposed) return;
    }
    await this.collision.build();
    if (this.disposed) { this.collision.dispose(); return; }
    this.debugSphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius, 16, 10),
      new THREE.MeshBasicMaterial({ color: '#e9cf8f', wireframe: true, depthWrite: false }),
    );
    this.debugSphere.name = 'Bird collision sphere';
    this.debugSphere.visible = false;
    this.onFrame = (frame) => this.update(frame);
    this.ready = true;
  }

  getSurfaceHeight(x, z) {
    const terrain = this.app.ground.heightAt(x, z);
    const water = this.app.activePondWater;
    return water && this.app.ground.containsPond?.(x, z, 0)
      ? Math.max(terrain, water.getSurfaceHeight(x, z)) : terrain;
  }

  getMinimumHeight(position) {
    const radius = this.radius;
    const x = position.x;
    const z = position.z;
    const support = Math.max(
      this.getSurfaceHeight(x, z),
      this.getSurfaceHeight(x - radius, z), this.getSurfaceHeight(x + radius, z),
      this.getSurfaceHeight(x, z - radius), this.getSurfaceHeight(x, z + radius),
    );
    return support + this.config.minimumGroundClearance + radius;
  }

  isPositionClear(position, minimumHeight = this.getMinimumHeight(position)) {
    const limit = this.halfSize - this.radius;
    if (Math.abs(position.x) > limit || Math.abs(position.z) > limit
      || position.y > this.config.maximumAltitude
      || position.y < minimumHeight) return false;
    if (sphereIntersectsBox(position, this.radius, this.app.readerCollisionBounds)) return false;
    return !this.collision.intersectsSphere(position, this.radius);
  }

  resolveMovementCandidate(position) {
    const floor = this.getMinimumHeight(position);
    position.y = Math.max(position.y, floor);
    position.y = Math.min(position.y, this.config.maximumAltitude);
    return this.isPositionClear(position, floor);
  }

  findSpawn() {
    const ant = this.app.getAntWorldPosition(this.antPosition);
    if (!ant) return false;
    for (const height of [this.config.spawnClearance, 5, 8, 12, 18]) {
      for (const distance of [0, 1.5, 3, 5, 8]) {
        const directions = distance === 0 ? 1 : 16;
        for (let index = 0; index < directions; index += 1) {
          const angle = index / directions * Math.PI * 2;
          this.position.set(ant.x + Math.sin(angle) * distance, 0, ant.z + Math.cos(angle) * distance);
          this.position.y = this.getMinimumHeight(this.position) + height;
          if (this.isPositionClear(this.position)) return true;
        }
      }
    }
    return false;
  }

  activate() {
    if (!this.ready) return false;
    if (!this.hasPosition || !this.isPositionClear(this.position)) {
      if (!this.findSpawn()) return false;
      this.hasPosition = true;
      this.motion.yaw = 0;
    }
    this.clearInput();
    this.active = true;
    this.suspended = false;
    this.app.addWorldObject(this.model.group);
    this.app.addWorldObject(this.debugSphere);
    this.model.group.visible = true;
    this.model.group.position.copy(this.position);
    this.debugSphere.position.copy(this.position);
    this.debugSphere.visible = this.debug;
    this.resetCamera();
    this.syncFrameSubscription();
    return true;
  }

  deactivate() {
    this.active = false;
    this.model.group.visible = false;
    this.debugSphere.visible = false;
    this.app.removeWorldObject(this.model.group);
    this.app.removeWorldObject(this.debugSphere);
    this.clearInput();
    this.syncFrameSubscription();
  }

  syncFrameSubscription() {
    const enabled = this.active && !this.paused;
    if (enabled && !this.unsubscribe) this.unsubscribe = this.app.onFrame(this.onFrame);
    else if (!enabled && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  setDebugEnabled(enabled) {
    this.debug = Boolean(enabled);
    if (this.debugSphere) this.debugSphere.visible = this.debug && this.active;
  }

  clearInput() {
    this.input.keys.clear();
    this.input.x = 0;
    this.input.y = 0;
    this.motion.speed = 0;
    this.motion.verticalSpeed = 0;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.clearInput();
    this.syncFrameSubscription();
  }

  setSuspended(suspended) {
    this.suspended = Boolean(suspended);
    this.clearInput();
    this.syncFrameSubscription();
  }

  setMovementKey(direction, pressed) {
    if (pressed) this.input.keys.add(direction);
    else this.input.keys.delete(direction);
  }

  setMovementAxes(x, y) {
    this.input.x = clampMovementAxis(x);
    this.input.y = clampMovementAxis(y);
  }

  resetCamera() {
    const camera = this.config.camera;
    this.cameraTarget.copy(this.position);
    this.cameraPosition.copy(this.position).add(this.cameraOffset.set(
      -Math.sin(this.motion.yaw) * camera.distance,
      camera.height,
      -Math.cos(this.motion.yaw) * camera.distance,
    ));
    this.app.setFlyingActorView(this.cameraPosition, this.cameraTarget, camera);
    return true;
  }

  update({ delta }) {
    if (!this.active || this.paused) return;
    const dt = Math.max(0, Math.min(Number(delta) || 0, 0.1));
    this.mixer.update(dt);
    if (this.suspended) return;
    const floor = this.getMinimumHeight(this.position);
    if (this.position.y < floor) {
      this.candidate.copy(this.position).setY(floor + 0.001);
      if (this.isPositionClear(this.candidate)) this.position.copy(this.candidate);
    }
    this.cameraForward.subVectors(this.app.controls.target, this.app.camera.position).normalize();
    let remaining = dt;
    while (remaining > 1e-8) {
      const step = Math.min(remaining, this.config.simulationStep);
      stepFlightMotion(this.motion, this.input, this.cameraForward, this.config, step, this.displacement);
      moveFlightSphere(this.position, this.displacement, this.radius, this.resolveCandidate, this.candidate);
      remaining -= step;
    }
    this.model.group.position.copy(this.position);
    this.euler.set(this.motion.pitch, this.motion.yaw + THREE.MathUtils.degToRad(SCENE_PROPS.bird.yawOffset), this.motion.bank);
    this.model.group.quaternion.setFromEuler(this.euler);
    this.debugSphere.position.copy(this.position);
    this.cameraTarget.copy(this.position);
    this.cameraDelta.subVectors(this.cameraTarget, this.app.controls.target)
      .multiplyScalar(1 - Math.exp(-this.config.camera.followResponsiveness * dt));
    this.app.camera.position.add(this.cameraDelta);
    this.app.controls.target.add(this.cameraDelta);
  }

  dispose() {
    this.disposed = true;
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.mixer?.stopAllAction();
    if (this.mixer) this.mixer.uncacheRoot(this.model.group);
    if (this.model) this.app.removeWorldObject(this.model.group);
    if (this.debugSphere) this.app.removeWorldObject(this.debugSphere);
    this.debugSphere?.geometry.dispose();
    this.debugSphere?.material.dispose();
    this.collision.dispose();
    this.ready = false;
  }
}
