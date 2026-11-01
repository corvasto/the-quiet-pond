import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { captureSurfaceMap } from '../core/surface-map.js';
import { getMapBounds } from '../utils/map-bounds.js';
import { SCENE_PROPS } from '../config/index.js';
import { ANT_MOVEMENT_CONFIG, ANT_CAMERA_FOLLOW_CONFIG } from '../config/world.js';
import { UNDERGROUND_CONFIG } from '../config/underground.js';
import { createUnderground } from '../generators/underground.js';
import { createFrameAnimationClip, resolveAnimationClip } from '../props/model-animation.js';
import { clampMotionDelta, clampMovementAxis, resolveMovementAxes, stepPlanarMotion, resolveGroundDirection, trackGroundOrbit } from '../utils/player-motion.js';

const cameraAngles = [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, Math.PI];
const cameraHeights = [0.18, 0.32];
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

// The surface actor, camera, and world are never reparented or modified here.
// A hidden orbit camera preserves the user's requested zoom behind obstacles.
export class UndergroundWorld {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#241a12');
    this.camera = new THREE.PerspectiveCamera(app.camera.fov, app.camera.aspect, 0.02, 60);
    this.orbitCamera = this.camera.clone();
    this.position = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.moveDirection = new THREE.Vector3();
    this.deltaTarget = new THREE.Vector3();
    this.lastTarget = new THREE.Vector3();
    this.cameraCandidate = new THREE.Vector3();
    this.resolvedCameraOffset = new THREE.Vector3();
    this.cameraSearchOffset = new THREE.Vector3();
    this.lastCameraOffset = new THREE.Vector3();
    this.antCameraMovementYaw = 0;
    this.antCameraInputAngle = null;
    this.velocity = new THREE.Vector3();
    this.displacement = new THREE.Vector3();
    this.assistTime = 0;
    this.manualActive = false;
    this.manualDelay = 0;
    this.keys = new Set();
    this.axes = { x: 0, y: 0, magnitude: 0 };
    this.inputX = 0;
    this.inputY = 0;
    this.active = false;
    this.ready = false;
    this.paused = false;
    this.exploreActive = false;
    this.running = false;
    this.cameraRadius = UNDERGROUND_CONFIG.camera.collisionRadius;
    this.surfaceMap = null;
    this.surfaceMapPending = null;
    this.surfaceMapAttempted = false;
    this.entryId = 0;
  }

  async start({ onProgress = () => {} } = {}) {
    if (this.ready) {
      return;
    }
    onProgress(12);
    await yieldToBrowser();
    if (this.disposed) return;
    const treePosition = this.app.tree?.group?.getWorldPosition(new THREE.Vector3());
    this.level = createUnderground({ treePosition, barkMaterial: this.app.tree?.woodMesh?.material });
    this.scene.add(this.level.group);
    onProgress(48);
    await yieldToBrowser();
    if (this.disposed) return;
    const recipe = SCENE_PROPS.ant.animation;
    const source = resolveAnimationClip(this.app.ant.animations, recipe.clip ?? 0);
    const options = { framesPerSecond: recipe.framesPerSecond,
      removeTracks: ['ant.position', 'ant.quaternion'] };
    this.walkClip = createFrameAnimationClip(source, { ...options, name: 'burrow walk', frames: recipe.ranges.walk });
    this.idleClip = createFrameAnimationClip(source, { ...options, name: 'burrow idle', frames: recipe.ranges.idle });
    this.player = this.createActor(1);
    this.position = this.player.group.position;
    this.cameraLight = new THREE.PointLight('#ffe8d2', 1.6, 5, 1.6);
    this.scene.add(this.cameraLight);
    this.controls = new OrbitControls(this.orbitCamera, this.app.renderer.domElement);
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => { this.manualActive = true; this.manualDelay = ANT_CAMERA_FOLLOW_CONFIG.assistResumeDelay; this.antCameraMovementYaw = 0; this.antCameraInputAngle = null; });
    this.controls.addEventListener('end', () => { this.manualActive = false; this.manualDelay = ANT_CAMERA_FOLLOW_CONFIG.assistResumeDelay; });
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = ANT_CAMERA_FOLLOW_CONFIG.rotateSpeed;
    this.controls.zoomSpeed = 0.65;
    this.controls.minDistance = UNDERGROUND_CONFIG.camera.minimumDistance;
    this.controls.maxDistance = UNDERGROUND_CONFIG.camera.maximumDistance;
    this.controls.minPolarAngle = 0.3;
    this.controls.maxPolarAngle = Math.PI * 0.58;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    onProgress(86);
    await yieldToBrowser();
    if (this.disposed) return;
    this.ready = true;
    onProgress(100);
  }

  createActor(scale) {
    // Model props keep their authored GLB in the first child. Attachments such
    // as the carried seed and surface night light belong to the surface game.
    const group = new THREE.Group();
    group.add(clone(this.app.ant.group.children[0]));
    group.scale.copy(this.app.ant.group.scale);
    group.name = 'Underground ant';
    group.visible = true;
    group.scale.multiplyScalar(scale);
    group.rotation.set(0, 0, 0);
    this.scene.add(group);
    const mixer = new THREE.AnimationMixer(group);
    const walk = this.walkClip ? mixer.clipAction(this.walkClip) : null;
    const idle = this.idleClip ? mixer.clipAction(this.idleClip) : null;
    const actor = { group, mixer, walk, idle, moving: null };
    this.setActorMoving(actor, false);
    return actor;
  }

  setActorMoving(actor, moving) {
    if (actor.moving === moving) return;
    actor.moving = moving;
    actor.mixer.stopAllAction();
    const action = moving ? actor.walk : actor.idle;
    if (action) {
      action.reset();
      action.timeScale = (SCENE_PROPS.ant.animation.speed || 1) * (actor === this.player && this.running ? SCENE_PROPS.ant.runAnimationMultiplier : 1);
      action.play();
    }
  }

  activate() {
    if (!this.ready || this.disposed) return false;
    this.active = true;
    this.entryId += 1;
    this.surfaceMap = null;
    this.surfaceMapAttempted = false;
    this.paused = false;
    this.exploreActive = false;
    this.position.copy(this.level.spawn);
    this.position.y += SCENE_PROPS.ant.lift;
    this.player.group.rotation.set(0, THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset), 0);
    this.clearInput();
    this.controls.enabled = true;
    this.resetCamera();
    return true;
  }

  deactivate() {
    this.active = false;
    this.clearInput();
    if (this.controls) this.controls.enabled = false;
  }

  clearInput() {
    this.keys.clear();
    this.inputX = 0;
    this.inputY = 0;
    this.running = false;
    this.antCameraMovementYaw = 0;
    this.antCameraInputAngle = null;
    this.velocity.set(0,0,0);
    this.displacement.set(0,0,0);
    this.assistTime = 0;
    if (this.player) this.setActorMoving(this.player, false);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.clearInput();
    if (this.controls) this.controls.enabled = this.active && !this.paused && !this.exploreActive;
  }

  setMovementAxes(x, y) {
    this.inputX = clampMovementAxis(x);
    this.inputY = clampMovementAxis(y);
  }

  setMovementKey(direction, pressed) {
    if (pressed) this.keys.add(direction);
    else this.keys.delete(direction);
  }

  setRunning(running) {
    this.running = Boolean(running);
    if (this.player?.walk) this.player.walk.timeScale = SCENE_PROPS.ant.animation.speed * (this.running ? SCENE_PROPS.ant.runAnimationMultiplier : 1);
  }

  setExploreActive(active) {
    this.exploreActive = Boolean(active);
    this.clearInput();
    this.manualActive=false;
    this.controls.enabled = this.active && !this.paused && !this.exploreActive;
    this.controls.enablePan = false;
    if (!this.exploreActive) this.resetCamera();
  }

  getMapData() {
    const pond = this.app.ground?.pondProfile;
    return {
      layout: this.level.layout,
      surfaceMap: this.surfaceMap,
      surfaceMapOpacity: UNDERGROUND_CONFIG.surfaceMapOpacity,
      position: { x: this.position.x, z: this.position.z },
      heading: this.player.group.rotation.y-THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset),
      pond: pond ? Array.from({length:64}, (_,i)=>pond.pointAt(i/64*Math.PI*2)) : [],
      pondCenter: pond?.center ?? null,
    };
  }

  async prepareMapSurface() {
    if (this.surfaceMap || this.surfaceMapAttempted || !this.app.renderer.isWebGLRenderer) return this.surfaceMap;
    if (this.surfaceMapPending) return this.surfaceMapPending;
    const entry = this.entryId;
    const pending = (async () => {
      // Let the modal paint first. There is no second live scene render loop.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (this.disposed || !this.active || !this.exploreActive || entry !== this.entryId) return null;
      this.surfaceMapAttempted = true;
      try {
        const width = this.app.renderer.domElement.clientWidth || 512;
        const tree=this.level.layout.treePosition;
        const groundHeight=this.app.ground?.heightAt(tree.x,tree.z) ?? 0;
        this.surfaceMap = captureSurfaceMap(this.app, getMapBounds(this.getMapData()),
          width < 600 ? 512 : 1024, undefined, groundHeight+UNDERGROUND_CONFIG.surfaceMapCutHeight);
        return this.surfaceMap;
      } catch (error) {
        console.warn('[the-quiet-pond] Surface map capture unavailable; keeping map outlines.', error);
        return null;
      }
    })();
    this.surfaceMapPending = pending;
    try { return await pending; }
    finally { if (this.surfaceMapPending === pending) this.surfaceMapPending = null; }
  }

  resetCamera() {
    if (!this.ready) return false;
    this.lastCameraOffset.set(0,0,0);
    this.antCameraMovementYaw=0; this.antCameraInputAngle=null;
    this.target.copy(this.position);
    this.target.y += UNDERGROUND_CONFIG.camera.lookHeight;
    this.controls.target.copy(this.target);
    this.lastTarget.copy(this.target);
    this.orbitCamera.position.copy(this.target);
    this.orbitCamera.position.z -= UNDERGROUND_CONFIG.camera.distance;
    this.orbitCamera.position.y += UNDERGROUND_CONFIG.camera.height;
    // Drain old damped rotation before assigning the reset pose.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.updateCamera(0);
    return true;
  }

  canExit() {
    const exit = this.level?.exit;
    return Boolean(this.active && exit
      && Math.hypot(this.position.x - exit.x, this.position.z - exit.z) <= UNDERGROUND_CONFIG.entranceRadius);
  }

  update({ delta = 0 } = {}) {
    if (!this.active || this.disposed) return;
    const dt = clampMotionDelta(delta);
    if (!this.paused && !this.exploreActive) {
      this.updateMovement(dt);
      this.player.mixer.update(dt);
    }
    this.updateCamera(dt);
  }

  updateMovement(dt) {
    if (this.exploreActive || this.paused) return;
    const horizontal = Number(this.keys.has('right')) - Number(this.keys.has('left'));
    const forward = Number(this.keys.has('forward')) - Number(this.keys.has('backward'));
    resolveMovementAxes(this.axes, horizontal, forward, this.inputX, this.inputY, ANT_MOVEMENT_CONFIG.analogDeadzone);
    if ((this.axes.magnitude === 0 && this.velocity.lengthSq() === 0) || dt === 0) {
      this.setActorMoving(this.player, false);
      this.antCameraMovementYaw = 0;
      this.antCameraInputAngle = null;
      return;
    }
    this.forward.subVectors(this.controls.target, this.camera.position).setY(0);
    if (this.forward.lengthSq() < 0.00001) this.forward.set(0, 0, 1);
    else this.forward.normalize();
    resolveGroundDirection(this.moveDirection, this, this.axes, this.forward.x, this.forward.z);
    const x = this.moveDirection.x, z = this.moveDirection.z;
    const speed = SCENE_PROPS.ant.moveSpeed * (this.running ? SCENE_PROPS.ant.runMultiplier : 1);
    stepPlanarMotion(this.velocity, this.displacement, x*speed, z*speed,
      ANT_MOVEMENT_CONFIG.acceleration, ANT_MOVEMENT_CONFIG.braking, dt);
    const dx = this.displacement.x;
    const dz = this.displacement.z;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.035));
    const actorPosition = this.position;
    const startX = actorPosition.x;
    const startZ = actorPosition.z;
    // Keep the camera target clear as well as the smaller ant body. Otherwise
    // orbiting while hugging a wall can put the near plane inside the soil.
    const clearance = Math.max(UNDERGROUND_CONFIG.antRadius, this.cameraRadius + 0.02);
    for (let step = 0; step < steps; step += 1) {
      if (this.level.layout.isWalkable(actorPosition.x + dx / steps, actorPosition.z, clearance)) {
        actorPosition.x += dx / steps;
      }
      if (this.level.layout.isWalkable(actorPosition.x, actorPosition.z + dz / steps, clearance)) {
        actorPosition.z += dz / steps;
      }
    }
    const moved = Math.hypot(actorPosition.x - startX, actorPosition.z - startZ) > 0.000001;
    if (Math.abs(actorPosition.x-startX) < 1e-8) this.velocity.x = 0;
    if (Math.abs(actorPosition.z-startZ) < 1e-8) this.velocity.z = 0;
    actorPosition.y = this.level.layout.heightAt(actorPosition.x, actorPosition.z) + SCENE_PROPS.ant.lift;
    if (moved && this.axes.magnitude > 0) {
      const desired = Math.atan2(x, z) + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
      const rotation = this.player.group.rotation.y;
      const difference = Math.atan2(Math.sin(desired - rotation), Math.cos(desired - rotation));
      this.player.group.rotation.y += difference * (1 - Math.exp(-ANT_MOVEMENT_CONFIG.turnResponsiveness * dt));
    }
    this.manualDelay = Math.max(0, this.manualDelay - dt);
    const assist = ANT_CAMERA_FOLLOW_CONFIG;
    // Sideways input strafes without swinging the view behind the ant.
    if (!moved || this.axes.y <= 0 || this.manualActive || this.manualDelay > 0) this.assistTime = 0;
    else this.assistTime += dt;
    if (moved && this.axes.y > 0 && this.assistTime >= assist.assistDelay) {
      const offsetX = this.orbitCamera.position.x - this.controls.target.x;
      const offsetZ = this.orbitCamera.position.z - this.controls.target.z;
      const yaw = Math.atan2(offsetX, offsetZ), desired = Math.atan2(startX-actorPosition.x, startZ-actorPosition.z);
      const difference = Math.atan2(Math.sin(desired-yaw), Math.cos(desired-yaw));
      const step = THREE.MathUtils.clamp(difference*(1-Math.exp(-assist.assistResponsiveness*dt)),
        -assist.assistMaxSpeed*dt, assist.assistMaxSpeed*dt);
      const next = yaw + step;
      const radius = Math.hypot(offsetX, offsetZ);
      this.orbitCamera.position.x = this.controls.target.x + Math.sin(next)*radius;
      this.orbitCamera.position.z = this.controls.target.z + Math.cos(next)*radius;
    }
    this.setActorMoving(this.player, moved);
  }

  updateCamera(dt) {
    if (this.camera.aspect !== this.app.camera.aspect) {
      this.camera.aspect = this.app.camera.aspect;
      this.orbitCamera.aspect = this.camera.aspect;
      this.camera.updateProjectionMatrix();
      this.orbitCamera.updateProjectionMatrix();
    }
    this.target.copy(this.position);
    this.target.y += UNDERGROUND_CONFIG.camera.lookHeight;
    const blend = 1-Math.exp(-ANT_CAMERA_FOLLOW_CONFIG.responsiveness*dt);
    this.deltaTarget.subVectors(this.target, this.controls.target).multiplyScalar(blend);
    this.orbitCamera.position.add(this.deltaTarget);
    this.controls.target.add(this.deltaTarget);
    this.target.copy(this.controls.target);
    // Contours determine target height immediately; horizontal follow stays smooth.
    if (!this.level.layout.isWalkable(this.target.x,this.target.z,this.cameraRadius+0.02)) {
      this.deltaTarget.subVectors(this.position,this.target).setY(0);
      this.orbitCamera.position.add(this.deltaTarget);
      this.target.x=this.position.x; this.target.z=this.position.z;
    }
    const targetY=this.level.layout.heightAt(this.target.x,this.target.z)+SCENE_PROPS.ant.lift+UNDERGROUND_CONFIG.camera.lookHeight;
    this.orbitCamera.position.y += targetY-this.target.y;
    this.target.y=targetY;
    this.controls.target.copy(this.target);
    this.lastTarget.copy(this.target);
    if (!this.paused && !this.exploreActive) {
      this.controls.dampingFactor = 1-Math.exp(-ANT_CAMERA_FOLLOW_CONFIG.orbitResponsiveness*dt);
      this.controls.update(dt);

    }
    this.offset.subVectors(this.orbitCamera.position, this.target);
    let distance = this.offset.length();
    if (distance < 0.0001) {
      this.offset.set(0, 0.3, -1).normalize();
      distance = UNDERGROUND_CONFIG.camera.minimumDistance;
    } else {
      this.offset.multiplyScalar(1 / distance);
    }
    const config = UNDERGROUND_CONFIG.camera;
    // Cover the near-plane corners even on a wide desktop viewport.
    const nearHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.near;
    const radius = Math.max(config.collisionRadius, Math.hypot(nearHeight, nearHeight * this.camera.aspect) + 0.035);
    this.cameraRadius = radius;
    let safeDistance=this.sweepCamera(this.offset,distance,radius);
    this.resolvedCameraOffset.copy(this.offset).multiplyScalar(safeDistance);
    // When an orbit faces a wall, choose a nearby clear shoulder instead of
    // pushing the view into the player or hiding the player model.
    let retained=false;
    if (safeDistance < config.framingDistance+0.1 && this.lastCameraOffset.length()>config.framingDistance*0.9) {
      const previousLength=this.lastCameraOffset.length();
      this.cameraSearchOffset.copy(this.lastCameraOffset).multiplyScalar(1/previousLength);
      const clear=this.sweepCamera(this.cameraSearchOffset,previousLength,radius);
      if(clear>config.framingDistance*0.9) {
        this.resolvedCameraOffset.copy(this.cameraSearchOffset).multiplyScalar(clear);
        retained=true;
      }
    }
    if (!retained && safeDistance < config.framingDistance) {
      const yaw=Math.atan2(this.offset.x,this.offset.z);
      let best=safeDistance;
      for (const angle of cameraAngles) for (const height of cameraHeights) {
        this.cameraSearchOffset.set(Math.sin(yaw+angle)*config.framingDistance,
          height,Math.cos(yaw+angle)*config.framingDistance);
        const length=this.cameraSearchOffset.length();
        this.cameraSearchOffset.multiplyScalar(1/length);
        const clear=this.sweepCamera(this.cameraSearchOffset,length,radius);
        if (clear>best+0.02) {
          best=clear;
          this.resolvedCameraOffset.copy(this.cameraSearchOffset).multiplyScalar(clear);
        }
      }
    }
    // Input follows the rendered view, including automatic shoulder changes.
    // Compensate those changes so a held direction stays on its ground heading.
    trackGroundOrbit(this,this.lastCameraOffset.x,this.lastCameraOffset.z,
      this.resolvedCameraOffset.x,this.resolvedCameraOffset.z);
    this.lastCameraOffset.copy(this.resolvedCameraOffset);
    this.camera.position.copy(this.target).add(this.resolvedCameraOffset);
    this.camera.lookAt(this.resolvedCameraOffset.lengthSq()>1e-8 ? this.target
      : this.cameraCandidate.copy(this.target).sub(this.offset));
    this.cameraLight.position.copy(this.camera.position);
    this.player.group.visible=true;
  }

  sweepCamera(direction,distance,radius) {
    const steps=Math.max(1,Math.ceil(distance/UNDERGROUND_CONFIG.camera.sweepStep));
    let safe=0;
    for(let step=1;step<=steps;step++) {
      const d=distance*step/steps;
      this.cameraCandidate.copy(this.target).addScaledVector(direction,d);
      if(!this.level.layout.containsSphere(this.cameraCandidate.x,this.cameraCandidate.y,this.cameraCandidate.z,radius)) break;
      safe=d;
    }
    return safe;
  }

  dispose() {
    this.disposed = true;
    this.surfaceMap = null;
    this.deactivate();
    this.controls?.dispose();
    this.player?.mixer.stopAllAction();
    // Actor clones share the surface geometry and materials, owned by PondApp.
    this.level?.dispose();
    this.scene.clear();
    this.ready = false;
  }
}
