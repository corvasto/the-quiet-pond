import * as THREE from 'three';
import { CAMERA_VIEWS, SCENE_PROPS, getHabitatArea } from '../config/index.js';
import { clampMotionDelta, trackGroundOrbit } from '../utils/player-motion.js';

const BURROW_ORBIT_DISTANCE = Math.hypot(0.7, 0.115);

function clearChamberFraction(chamber, target, x, y, z) {
  const steps = Math.min(64, Math.max(1, Math.ceil(Math.hypot(x, y, z) / 0.025)));
  let fraction = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!chamber.containsCamera(target.x + x * t, target.y + y * t, target.z + z * t)) {
      let low = fraction, high = t;
      for (let j = 0; j < 6; j++) {
        const middle = (low + high) / 2;
        if (chamber.containsCamera(target.x + x * middle, target.y + y * middle, target.z + z * middle)) low = middle;
        else high = middle;
      }
      return low;
    }
    fraction = t;
  }
  return fraction;
}

export function resolveChamberCameraOffset(chamber, target, requested, output) {
  const distance = requested.length();
  if (distance < 1e-6) return output.set(0, 0.1, 0);
  const scale = Math.min(1, (chamber.cameraDistance ?? 1.5) / distance);
  const x = requested.x * scale, y = requested.y * scale, z = requested.z * scale;
  const fraction = clearChamberFraction(chamber, target, x, y, z);
  return output.set(x * fraction, y * fraction, z * fraction);
}

function easeInOut(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function constrainCameraToGameRocks(app, target, offset) {
  app.antCameraPosition.copy(target).add(offset);
  if (app.isGameCameraClear?.(target, app.antCameraPosition) !== false) return;
  let low = 0, high = 1;
  for (let i = 0; i < 8; i++) {
    const middle = (low + high) / 2;
    app.antCameraPosition.copy(target).addScaledVector(offset, middle);
    if (app.isGameCameraClear(target, app.antCameraPosition)) low = middle;
    else high = middle;
  }
  offset.multiplyScalar(low);
}

const cameraMethods = {
  updateBurrowSurfaceCamera(actor, delta) {
    const blend = 1 - Math.exp(-8 * clampMotionDelta(delta));
    const state = this.chamberPassageCamera;
    const orbitDistance = state.surfaceOrbitDistance ?? BURROW_ORBIT_DISTANCE;
    this.antCameraDelta.subVectors(this.camera.position, this.controls.target);
    if (!state.surfaceOffset) {
      state.surfaceOffset = this.antCameraDelta.clone().setLength(orbitDistance);
      state.surfaceRendered = this.antCameraDelta.clone();
    } else if (!state.surfaceReset && (this.antCameraManualActive || this.antCameraDelta.distanceToSquared(state.surfaceRendered) > 1e-10)) {
      trackGroundOrbit(this, state.surfaceRendered.x, state.surfaceRendered.z, this.antCameraDelta.x, this.antCameraDelta.z);
      state.surfaceOffset.copy(this.antCameraDelta).setLength(orbitDistance);
    }
    const previousDistance = state.surfaceRendered.length();
    this.antCameraDelta.set(actor.x, actor.y + 0.045, actor.z).sub(this.controls.target);
    this.camera.position.add(this.antCameraDelta); this.controls.target.add(this.antCameraDelta);
    this.camera.position.copy(this.controls.target).add(state.surfaceOffset);
    const beforeX = state.surfaceOffset.x, beforeZ = state.surfaceOffset.z;
    if (this.antCameraFollow.enabled) this.controls.dampingFactor = 1 - Math.exp(-this.antCameraFollow.orbitResponsiveness * clampMotionDelta(delta));
    this.controls.update(delta);
    state.surfaceOffset.subVectors(this.camera.position, this.controls.target).setLength(orbitDistance);
    if (state.surfaceReset) {
      if (this.antCameraManualActive) state.surfaceReset = null;
      else {
        const reset = state.surfaceReset;
        reset.elapsed += clampMotionDelta(delta);
        const progress = Math.min(1, reset.elapsed / 0.32);
        const yaw = reset.fromYaw + reset.turn * easeInOut(progress);
        state.surfaceOffset.set(Math.sin(yaw) * reset.horizontal, reset.height, Math.cos(yaw) * reset.horizontal);
        if (progress === 1) state.surfaceReset = null;
      }
    }
    this.antCameraDelta.copy(state.surfaceOffset).setLength(THREE.MathUtils.lerp(previousDistance, orbitDistance, blend));
    constrainCameraToGameRocks(this, this.controls.target, this.antCameraDelta);
    this.camera.position.copy(this.controls.target).add(this.antCameraDelta);
    state.surfaceRendered.copy(this.antCameraDelta);
    this.camera.lookAt(this.controls.target);
    trackGroundOrbit(this, beforeX, beforeZ,
      this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    this.antCameraLastPosition.copy(actor); this.antCameraHasLastPosition = true;
  },

  updatePassageCamera(actor, chamber, delta) {
    const state = this.chamberPassageCamera;
    const beforeX = this.camera.position.x - this.controls.target.x;
    const beforeZ = this.camera.position.z - this.controls.target.z;
    const travelZ = this.antVelocity?.z ?? 0;
    const direction = Math.abs(travelZ) > 0.04 ? Math.sign(travelZ) : state.direction;
    if (!state.poseInitialized || state.direction !== direction) {
      state.direction = direction;
      const yaw = Math.atan2(beforeX, beforeZ), toYaw = direction > 0 ? Math.PI : 0;
      const turn = Math.atan2(Math.sin(toYaw - yaw), Math.cos(toYaw - yaw));
      state.turn = { elapsed: 0, yaw, turn, radius: Math.hypot(beforeX, beforeZ),
        height: this.camera.position.y - this.controls.target.y,
        target: this.controls.target.clone().sub(actor), rotating: Math.abs(turn) > 0.035 };
      state.poseInitialized = true;
    }
    chamber.setPassageCamera(actor, this.camera, this.controls.target, state.direction);
    const turn = state.turn;
    if (turn) {
      turn.elapsed += clampMotionDelta(delta);
      const duration = turn.rotating ? chamber.passageCameraTurnDuration : 0.3;
      const progress = Math.min(1, turn.elapsed / duration);
      this.antCameraDelta.subVectors(this.camera.position, this.controls.target);
      const endRadius = Math.hypot(this.antCameraDelta.x, this.antCameraDelta.z), endHeight = this.antCameraDelta.y;
      let yaw, radius, height;
      if (!turn.rotating) {
        const blend = easeInOut(progress);
        yaw = turn.yaw + turn.turn * blend;
        radius = THREE.MathUtils.lerp(turn.radius, endRadius, blend);
        height = THREE.MathUtils.lerp(turn.height, endHeight, blend);
      } else if (progress < 0.22) {
        const blend = easeInOut(progress / 0.22);
        yaw = turn.yaw;
        radius = THREE.MathUtils.lerp(turn.radius, chamber.passageCameraTurnRadius, blend);
        height = THREE.MathUtils.lerp(turn.height, 0.1, blend);
      } else if (progress < 0.77) {
        yaw = turn.yaw + turn.turn * easeInOut((progress - 0.22) / 0.55);
        radius = chamber.passageCameraTurnRadius; height = 0.1;
      } else {
        const blend = easeInOut((progress - 0.77) / 0.23);
        yaw = turn.yaw + turn.turn;
        radius = THREE.MathUtils.lerp(chamber.passageCameraTurnRadius, endRadius, blend);
        height = THREE.MathUtils.lerp(0.1, endHeight, blend);
      }
      this.antCameraTarget.copy(actor).add(turn.target).lerp(this.controls.target, easeInOut(Math.min(1, progress / 0.22)));
      this.antCameraTarget.y = Math.max(this.antCameraTarget.y, actor.y + 0.08);
      this.controls.target.copy(this.antCameraTarget);
      this.antCameraDelta.set(Math.sin(yaw) * radius, height, Math.cos(yaw) * radius);
      if (progress === 1) state.turn = null;
    } else this.antCameraDelta.subVectors(this.camera.position, this.controls.target);
    resolveChamberCameraOffset(chamber, this.controls.target, this.antCameraDelta, this.antCameraDelta);
    constrainCameraToGameRocks(this, this.controls.target, this.antCameraDelta);
    this.camera.position.copy(this.controls.target).add(this.antCameraDelta);
    this.camera.lookAt(this.controls.target);
    trackGroundOrbit(this, beforeX, beforeZ,
      this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    this.antCameraLastPosition.copy(actor); this.antCameraHasLastPosition = true;
  },

  updateChamberReset(actor, chamber, delta) {
    const reset = this.chamberCameraReset;
    const beforeX = this.camera.position.x - this.controls.target.x;
    const beforeZ = this.camera.position.z - this.controls.target.z;
    reset.elapsed += clampMotionDelta(delta);
    const progress = Math.min(1, reset.elapsed / (chamber.passageCameraTurnDuration ?? 0.85));
    const closeRadius = Math.min(reset.radius, chamber.passageCameraTurnRadius ?? 0.24);
    let yaw, radius, height;
    if (progress < 0.22) {
      const blend = easeInOut(progress / 0.22);
      yaw = reset.yaw; radius = THREE.MathUtils.lerp(reset.radius, closeRadius, blend);
      height = THREE.MathUtils.lerp(reset.height, 0.12, blend);
    } else if (progress < 0.77) {
      yaw = reset.yaw + reset.turn * easeInOut((progress - 0.22) / 0.55);
      radius = closeRadius; height = 0.12;
    } else {
      const blend = easeInOut((progress - 0.77) / 0.23);
      yaw = reset.yaw + reset.turn; radius = THREE.MathUtils.lerp(closeRadius, chamber.cameraDistance ?? 1.5, blend);
      height = THREE.MathUtils.lerp(0.12, 0.22, blend);
    }
    this.controls.target.set(actor.x, actor.y + 0.15, actor.z);
    this.antCameraTarget.copy(actor).add(reset.target).lerp(this.controls.target, easeInOut(Math.min(1, progress / 0.22)));
    this.controls.target.copy(this.antCameraTarget);
    this.antCameraDelta.set(Math.sin(yaw) * radius, height, Math.cos(yaw) * radius);
    resolveChamberCameraOffset(chamber, this.controls.target, this.antCameraDelta, this.antCameraDelta);
    constrainCameraToGameRocks(this, this.controls.target, this.antCameraDelta);
    this.camera.position.copy(this.controls.target).add(this.antCameraDelta);
    this.camera.lookAt(this.controls.target);
    this.chamberLastRenderedOffset ??= new THREE.Vector3();
    this.chamberLastRenderedOffset.copy(this.antCameraDelta);
    trackGroundOrbit(this, beforeX, beforeZ, this.antCameraDelta.x, this.antCameraDelta.z);
    this.antCameraLastPosition.copy(actor); this.antCameraHasLastPosition = true;
    if (progress === 1) this.chamberCameraReset = null;
  },

  setFlyingActorView(position, target, tuning) {
    this.clearCameraOrbitMomentum();
    this.clearAntMovement();
    this.cameraTween = null;
    this.activeView = 'bird';
    this.controls.enabled = true;
    this.controls.enableRotate = true;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.zoomToCursor = false;
    this.controls.autoRotate = false;
    this.controls.minDistance = tuning.minimumDistance;
    this.controls.maxDistance = tuning.maximumDistance;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI - 0.18;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.52;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.update();
  },
  getAntCameraFacingDirection(target = new THREE.Vector3()) {
    if (!this.ant?.group?.parent) return null;
    this.ant.group.getWorldQuaternion(this.antCameraWorldQuaternion);
    this.antCameraLocalForward.set(0, 0, 1).applyAxisAngle(
      this.antPoseUp,
      -THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset),
    );
    target.copy(this.antCameraLocalForward)
      .applyQuaternion(this.antCameraWorldQuaternion)
      .setY(0);
    if (target.lengthSq() < 0.000001) return null;
    return target.normalize();
  },

  getAntCameraPose(options = null) {
    const followFacing = options?.followFacing === true;
    const config = SCENE_PROPS.ant;
    const antPosition = this.getAntWorldPosition(this.antCameraAnchor) ?? this.viewOffset;
    this.antCameraTarget.set(
      antPosition.x,
      antPosition.y + config.cameraLookHeight,
      antPosition.z,
    );
    if (followFacing && this.antCameraFollow.enabled) {
      const facing = this.getAntCameraFacingDirection(this.antCameraFacing);
      if (facing) this.antCameraHeading.copy(facing);
      this.antCameraTarget.addScaledVector(
        this.antCameraHeading,
        this.antCameraFollow.lookAhead,
      );
      this.antCameraPosition.set(
        antPosition.x,
        antPosition.y + config.cameraLookHeight,
        antPosition.z,
      )
        .addScaledVector(this.antCameraHeading, -this.antCameraFollow.distance)
        .addScaledVector(this.antPoseUp, this.antCameraFollow.height);
    } else {
      this.antCameraPosition.set(
        antPosition.x + config.cameraOffset.x,
        antPosition.y + config.cameraOffset.y,
        antPosition.z + config.cameraOffset.z,
      );
    }
    return this.antCameraPose;
  },

  resetAntCameraFollow() {
    this.antCameraMovementYaw = 0;
    this.antCameraInputAngle = null;
    this.antCameraHasLastPosition = false;
    this.antCameraAssistTravelTime = 0;
    this.antCameraAssistPause = 0;
  },

  clearCameraOrbitMomentum() {
    const position = this.camera.position.clone();
    const target = this.controls.target.clone();
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = damping;
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
  },

  resetAntCameraView() {
    if (!this.isAntViewActive() || !this.ant) return false;
    if (this.ground?.chamber?.cameraNearBurrow?.(this.ant.group.position) && !this.ground.chamber.below(this.ant.group.position)) {
      this.cameraTween = null;
      this.clearCameraOrbitMomentum();
      this.chamberPassageCamera ??= { rotate: this.controls.enableRotate, zoom: this.controls.enableZoom, surface: true };
      const state = this.chamberPassageCamera;
      const offset = this.camera.position.clone().sub(this.controls.target);
      const fromYaw = Math.atan2(offset.x, offset.z);
      const heading = this.ant.group.rotation.y - THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
      const toYaw = heading + Math.PI;
      state.surfaceOffset = offset.clone(); state.surfaceRendered = offset;
      state.surfaceOrbitDistance = offset.length();
      state.surfaceReset = { fromYaw, turn: Math.atan2(Math.sin(toYaw - fromYaw), Math.cos(toYaw - fromYaw)),
        horizontal: Math.hypot(offset.x, offset.z), height: offset.y, elapsed: 0 };
      return true;
    }
    if (this.ground?.chamber?.below(this.ant.group.position)) {
      this.cameraTween = null;
      this.clearCameraOrbitMomentum();
      const actor = this.ant.group.position;
      const heading = this.ant.group.rotation.y - THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
      if (this.ground.chamber.cameraInPassage(actor)) {
        this.chamberPassageCamera ??= { rotate: this.controls.enableRotate, zoom: this.controls.enableZoom,
          direction: Math.sign(Math.cos(heading)) || 1 };
        this.chamberPassageCamera.poseInitialized = false;
        return true;
      }
      const offset = this.camera.position.clone().sub(this.controls.target);
      const yaw = Math.atan2(offset.x, offset.z), toYaw = heading + Math.PI;
      this.chamberCameraReset = { yaw, turn: Math.atan2(Math.sin(toYaw - yaw), Math.cos(toYaw - yaw)),
        radius: Math.hypot(offset.x, offset.z), height: offset.y, elapsed: 0,
        target: this.controls.target.clone().sub(actor) };
      this.chamberCameraRequestedOffset ??= new THREE.Vector3();
      const distance = this.ground.chamber.cameraDistance ?? 1.5;
      this.chamberCameraRequestedOffset.set(-Math.sin(heading) * distance, 0.22, -Math.cos(heading) * distance);
      return true;
    }
    this.clearCameraOrbitMomentum();
    this.antCameraMovementYaw = 0;
    this.antCameraInputAngle = null;
    this.antCameraAssistTravelTime = 0;
    this.antCameraAssistPause = this.antCameraFollow.assistResumeDelay ?? 2.5;
    const pose = this.getAntCameraPose(this.antCameraFollowPoseOptions);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.camera.position.copy(pose.position);
      this.controls.target.copy(pose.target);
      this.camera.lookAt(this.controls.target);
      this.cameraTween = null;
    } else {
      this.cameraTween = {
        startedAt: performance.now(),
        duration: 320,
        fromPosition: this.camera.position.clone(),
        toPosition: pose.position.clone(),
        fromTarget: this.controls.target.clone(),
        toTarget: pose.target.clone(),
        antAnchor: this.antCameraAnchor.clone(),
      };
    }
    return true;
  },

  updateAntCamera(delta, immediate = false) {
    if (!this.isAntViewActive() || !this.ant) return;
    const antPosition = this.getAntWorldPosition(this.antCameraAnchor);
    if (!antPosition) return;
    const chamber = this.ground?.chamber;
    const nearBurrow = chamber?.cameraNearBurrow?.(antPosition) && !chamber.below(antPosition) && !this.antFlightEnabled;
    const passage = chamber?.cameraInPassage?.(antPosition) && !this.antFlightEnabled;
    if (nearBurrow || passage) this.burrowCameraBaseFov ??= this.camera.fov;
    if (this.burrowCameraBaseFov != null) {
      const fov = nearBurrow || passage ? chamber.entranceCameraFov : this.burrowCameraBaseFov;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, 1 - Math.exp(-8 * clampMotionDelta(delta)));
      if (Math.abs(this.camera.fov - fov) < 0.01) this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (nearBurrow) {
      this.chamberCameraReset = null;
      if (!this.chamberPassageCamera) {
        this.chamberPassageCamera = { rotate: this.controls.enableRotate, zoom: this.controls.enableZoom, surface: true };
        this.clearCameraOrbitMomentum();
      }
      this.chamberPassageCamera.surface = true;
      this.controls.enableRotate = true; this.controls.enableZoom = false;
      this.chamberCameraRequestedOffset = null; this.chamberLastRenderedOffset = null;
      this.updateBurrowSurfaceCamera(antPosition, delta);
      return;
    }
    if ((passage
      || (this.chamberPassageCamera && chamber?.cameraAtMouth?.(antPosition))) && !this.antFlightEnabled) {
      this.chamberCameraReset = null;
      if (!this.chamberPassageCamera || this.chamberPassageCamera.surface) {
        const heading = this.ant.group.rotation.y - THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
        const direction = Math.abs(this.antVelocity?.z ?? 0) > 0.01 ? Math.sign(this.antVelocity.z)
          : Math.sign(Math.cos(heading)) || 1;
        const previous = this.chamberPassageCamera;
        this.chamberPassageCamera = { rotate: previous?.rotate ?? this.controls.enableRotate,
          zoom: previous?.zoom ?? this.controls.enableZoom, direction };
        this.clearCameraOrbitMomentum();
      }
      this.controls.enableRotate = false; this.controls.enableZoom = false;
      this.chamberCameraRequestedOffset = null;
      this.chamberLastRenderedOffset = null;
      this.updatePassageCamera(antPosition, chamber, delta);
      return;
    }
    if (this.chamberPassageCamera) {
      this.controls.enableRotate = this.chamberPassageCamera.rotate;
      this.controls.enableZoom = this.chamberPassageCamera.zoom;
      this.chamberPassageCamera = null;
      this.clearCameraOrbitMomentum();
      if (chamber?.entrance && antPosition.z < chamber.entrance.z && !chamber.below(antPosition)) {
        const pose = this.getAntCameraPose(this.antCameraFollowPoseOptions);
        this.cameraTween = {
          startedAt: performance.now(), duration: 750, surfaceReturn: true,
          fromPosition: this.camera.position.clone(), toPosition: pose.position.clone(),
          fromTarget: this.controls.target.clone(), toTarget: pose.target.clone(),
          antAnchor: antPosition.clone(), fromFov: this.camera.fov, toFov: this.burrowCameraBaseFov ?? this.camera.fov,
        };
        this.chamberCameraRequestedOffset = null;
        this.chamberLastRenderedOffset = null;
        this.antCameraAssistTravelTime = 0;
        this.antCameraAssistPause = this.antCameraFollow.assistResumeDelay ?? 2.5;
        this.antCameraLastPosition.copy(antPosition);
        return;
      }
      if (chamber?.below(antPosition)) {
        this.chamberLastRenderedOffset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        this.chamberCameraRequestedOffset = this.chamberLastRenderedOffset.clone();
        const distance = chamber.cameraDistance ?? 1.5;
        const horizontal = Math.hypot(this.chamberCameraRequestedOffset.x, this.chamberCameraRequestedOffset.z) || 1;
        this.chamberCameraRequestedOffset.x *= distance / horizontal;
        this.chamberCameraRequestedOffset.z *= distance / horizontal;
        this.chamberCameraRequestedOffset.y = 0.22;
      }
    }
    const insideChamber = chamber?.below(antPosition) && !this.antFlightEnabled;
    if (this.chamberCameraReset) {
      if (insideChamber && !this.antCameraManualActive) {
        this.updateChamberReset(antPosition, chamber, delta);
        return;
      }
      this.chamberCameraReset = null;
      if (insideChamber) this.chamberCameraRequestedOffset?.subVectors(this.camera.position, this.controls.target);
    }
    if (insideChamber && this.antCameraManualActive && this.chamberCameraRequestedOffset && this.chamberLastRenderedOffset) {
      const x = this.camera.position.x - this.controls.target.x, z = this.camera.position.z - this.controls.target.z;
      trackGroundOrbit(this, this.chamberLastRenderedOffset.x, this.chamberLastRenderedOffset.z, x, z);
      this.chamberCameraRequestedOffset.subVectors(this.camera.position, this.controls.target);
      this.chamberLastRenderedOffset.copy(this.chamberCameraRequestedOffset);
    }
    // Restore the requested orbit before controls update. Collision only adjusts
    // the rendered camera, so minimum distance cannot fight the correction.
    if (this.chamberCameraRequestedOffset) {
      this.camera.position.copy(this.controls.target).add(this.chamberCameraRequestedOffset);
      if (!insideChamber) this.chamberCameraRequestedOffset = null;
    }

    const moved = this.antCameraHasLastPosition
      && this.antCameraLastPosition.distanceToSquared(antPosition) > 0.00000001;
    const travelX = this.antCameraHasLastPosition ? antPosition.x - this.antCameraLastPosition.x : 0;
    const travelZ = this.antCameraHasLastPosition ? antPosition.z - this.antCameraLastPosition.z : 0;
    this.antCameraLastPosition.copy(antPosition);
    this.antCameraHasLastPosition = true;

    const dt = clampMotionDelta(delta);
    if (this.antCameraFollow.enabled) {
      this.controls.dampingFactor = 1 - Math.exp(-this.antCameraFollow.orbitResponsiveness * dt);
    }
    if (insideChamber) {
      this.antCameraDelta.subVectors(antPosition, this.controls.target);
      this.antCameraDelta.y += 0.15;
      this.camera.position.add(this.antCameraDelta);
      this.controls.target.add(this.antCameraDelta);
      this.updateAntCameraAssistance(dt, travelX, travelZ);
      this.updateAntOrbitControls(delta);
      return;
    }
    if (this.antCameraFollow.enabled && this.antCameraFollow.followFacing && (moved || immediate)) {
      const pose = this.getAntCameraPose(this.antCameraFollowPoseOptions);
      const blend = immediate ? 1 : 1 - Math.exp(
        -dt * this.antCameraFollow.responsiveness,
      );
      this.camera.position.lerp(pose.position, blend);
      this.controls.target.lerp(pose.target, blend);
      this.updateAntOrbitControls(delta);
      return;
    }

    const pose = this.getAntCameraPose();
    const responsiveness = this.antCameraFollow.enabled ? this.antCameraFollow.responsiveness : 12;
    const blend = immediate ? 1 : 1 - Math.exp(-dt * responsiveness);
    this.antCameraDelta
      .subVectors(pose.target, this.controls.target)
      .multiplyScalar(blend);
    this.camera.position.add(this.antCameraDelta);
    this.controls.target.add(this.antCameraDelta);
    this.updateAntCameraAssistance(dt, travelX, travelZ);
    this.updateAntOrbitControls(delta);
  },

  updateAntOrbitControls(delta) {
    const beforeX = this.camera.position.x - this.controls.target.x;
    const beforeZ = this.camera.position.z - this.controls.target.z;
    this.controls.update(delta);
    const chamber = this.ground?.chamber;
    const actor = this.ant?.group.position;
    if (chamber && actor && chamber.below(actor) && !this.antFlightEnabled) {
      this.controls.target.set(actor.x, actor.y + 0.15, actor.z);
      this.antCameraDelta.subVectors(this.camera.position, this.controls.target);
      this.chamberCameraRequestedOffset ??= new THREE.Vector3();
      this.chamberCameraRequestedOffset.copy(this.antCameraDelta);
      resolveChamberCameraOffset(chamber, this.controls.target, this.antCameraDelta, this.antCameraDelta);
      if (this.chamberLastRenderedOffset && delta > 0) {
        const safeDistance = this.antCameraDelta.length();
        const previousDistance = this.chamberLastRenderedOffset.length();
        if (safeDistance > previousDistance && safeDistance > 1e-6) {
          const distance = THREE.MathUtils.lerp(previousDistance, safeDistance, 1 - Math.exp(-8 * clampMotionDelta(delta)));
          this.antCameraDelta.multiplyScalar(distance / safeDistance);
        }
      }
      this.chamberLastRenderedOffset ??= new THREE.Vector3();
      this.chamberLastRenderedOffset.copy(this.antCameraDelta);
      this.camera.position.copy(this.controls.target).add(this.antCameraDelta);
      this.camera.lookAt(this.controls.target);
    }
    trackGroundOrbit(this, beforeX, beforeZ,
      this.camera.position.x-this.controls.target.x,
      this.camera.position.z-this.controls.target.z);
    if (!chamber?.below(actor)) this.chamberLastRenderedOffset = null;
  },

  updateAntCameraAssistance(dt, travelX, travelZ) {
    const config = this.antCameraFollow;
    if (!config.enabled || !config.assistEnabled || this.antMotionLocked || this.antFlightEnabled) return;
    this.antCameraAssistPause = Math.max(0, (this.antCameraAssistPause ?? 0) - dt);
    // Ignore vertical climbing and tiny contact corrections.
    const traveling = travelX * travelX + travelZ * travelZ > (0.025 * dt) ** 2;
    if (!traveling || this.antCameraManualActive || this.antCameraAssistPause > 0 || this.cameraTween) {
      this.antCameraAssistTravelTime = 0;
      return;
    }
    this.antCameraAssistTravelTime = (this.antCameraAssistTravelTime ?? 0) + dt;
    if (this.antCameraAssistTravelTime < config.assistDelay) return;
    const offsetX = this.camera.position.x - this.controls.target.x;
    const offsetZ = this.camera.position.z - this.controls.target.z;
    const radius = Math.hypot(offsetX, offsetZ);
    if (radius < 0.0001) return;
    const current = Math.atan2(offsetX, offsetZ);
    const desired = Math.atan2(-travelX, -travelZ);
    const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
    const step = THREE.MathUtils.clamp(
      difference * (1 - Math.exp(-config.assistResponsiveness * dt)),
      -config.assistMaxSpeed * dt,
      config.assistMaxSpeed * dt,
    );
    this.camera.position.x = this.controls.target.x + Math.sin(current + step) * radius;
    this.camera.position.z = this.controls.target.z + Math.cos(current + step) * radius;
    this.antCameraMovementYaw = (this.antCameraMovementYaw ?? 0) + step;
  },

  setView(name, immediate = false) {
    this.clearCameraOrbitMomentum();
    const namedView = CAMERA_VIEWS[name] ?? this.cameraViews[name];
    const requestedView = name === 'ant' && this.ant && this.ground
      ? 'ant'
      : (namedView ? name : 'hero');
    const view = requestedView === 'ant'
      ? null
      : (CAMERA_VIEWS[requestedView] ?? this.cameraViews[requestedView] ?? CAMERA_VIEWS.hero);
    const customControls = view?.controls;
    const controlNumber = (key, fallback) => (
      Number.isFinite(customControls?.[key]) ? customControls[key] : fallback
    );
    this.activeView = requestedView;
    this.clearAntMovement();
    this.resetAntCameraFollow();
    const habitat = getHabitatArea(this.settings.area);
    this.controls.enabled = true;
    this.controls.enableRotate = requestedView === 'ant'
      ? true
      : (customControls?.enableRotate ?? true);
    this.controls.enablePan = requestedView === 'ant'
      ? false
      : (customControls?.enablePan ?? !habitat.infinite);
    this.controls.enableZoom = requestedView === 'ant'
      ? this.antCameraFollow.enableZoom === true
      : (customControls?.enableZoom ?? true);
    this.controls.zoomToCursor = requestedView === 'ant'
      ? false
      : (customControls?.zoomToCursor ?? !habitat.infinite);
    this.controls.minDistance = requestedView === 'ant'
      ? (this.antCameraFollow.minDistance ?? 0.25)
      : controlNumber('minDistance', 4.6);
    this.controls.maxDistance = requestedView === 'ant'
      ? (this.antCameraFollow.maxDistance ?? 1.2)
      : controlNumber('maxDistance', habitat.cameraMaxDistance);
    this.controls.minPolarAngle = requestedView === 'ant'
      ? 0.3
      : controlNumber('minPolarAngle', 0.14);
    this.controls.maxPolarAngle = requestedView === 'ant'
      ? Math.PI * 0.48
      : controlNumber('maxPolarAngle', habitat.infinite ? Math.PI * 0.495 : Math.PI * 0.53);
    this.controls.autoRotate = requestedView === 'ant'
      ? false
      : (customControls?.autoRotate ?? this.settings.autoRotate);
    this.controls.rotateSpeed = requestedView === 'ant'
      ? (this.antCameraFollow.rotateSpeed ?? 0.52)
      : 0.52;
    this.controls.dampingFactor = requestedView === 'ant' && this.antCameraFollow.enabled
      ? 1 - Math.exp(-this.antCameraFollow.orbitResponsiveness / 60)
      : 0.055;
    this.controls.mouseButtons.RIGHT = requestedView === 'ant' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;

    let targetPosition;
    let targetFocus;
    if (requestedView === 'ant') {
      const pose = this.getAntCameraPose(this.antCameraFollowPoseOptions);
      targetPosition = pose.position.clone();
      targetFocus = pose.target.clone();
    } else {
      targetPosition = new THREE.Vector3()
        .fromArray(view.position)
        .add(this.viewOffset);
      targetFocus = new THREE.Vector3()
        .fromArray(view.target)
        .add(this.viewOffset);
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (immediate || reducedMotion) {
      this.camera.position.copy(targetPosition);
      this.controls.target.copy(targetFocus);
      if (requestedView === 'ant') {
        this.camera.lookAt(targetFocus);
      } else {
        this.controls.update();
      }
      this.cameraTween = null;
      return;
    }

    this.cameraTween = {
      startedAt: performance.now(),
      duration: 950,
      fromPosition: this.camera.position.clone(),
      toPosition: targetPosition,
      fromTarget: this.controls.target.clone(),
      toTarget: targetFocus,
      antAnchor: requestedView === 'ant' ? this.antCameraAnchor.clone() : null,
    };
  },

  focusSunGlare() {
    const habitat = getHabitatArea(this.settings.area);
    const canopyCenter = this.viewOffset.clone().add(new THREE.Vector3(0, 7.2, 0));
    const horizontalSun = this.environment.sunDirection.clone().setY(0).normalize();
    const side = new THREE.Vector3(-horizontalSun.z, 0, horizontalSun.x);
    const position = canopyCenter
      .addScaledVector(horizontalSun, -2.8)
      .addScaledVector(side, 2.5)
      .setY(this.viewOffset.y + 2.1);
    const lookDirection = this.environment.sunDirection.clone().addScaledVector(side, -0.28).normalize();
    const target = position.clone().addScaledVector(lookDirection, 18);

    this.activeView = 'sun-glare';
    this.clearAntMovement();
    this.controls.enabled = true;
    this.controls.enableRotate = true;
    this.controls.enablePan = !habitat.infinite;
    this.controls.enableZoom = true;
    this.controls.zoomToCursor = !habitat.infinite;
    this.controls.minDistance = 4.6;
    this.controls.maxDistance = habitat.cameraMaxDistance;
    this.controls.minPolarAngle = 0.14;
    this.controls.maxPolarAngle = Math.PI * 0.94;
    this.controls.autoRotate = false;
    this.camera.position.copy(position);
    this.controls.target.copy(target);
    this.controls.update();
    this.cameraTween = null;
  },

  updateCameraTween() {
    if (!this.cameraTween) return;
    const surfaceReturn = this.cameraTween.surfaceReturn;
    if (surfaceReturn && (this.ground?.chamber?.cameraInPassage?.(this.ant.group.position)
      || this.ground?.chamber?.cameraNearBurrow?.(this.ant.group.position))) {
      this.cameraTween = null;
      return;
    }
    const beforeX = this.camera.position.x - this.controls.target.x;
    const beforeZ = this.camera.position.z - this.controls.target.z;
    if (this.cameraTween.antAnchor && this.isAntViewActive()) {
      const position = this.getAntWorldPosition(this.antCameraAnchor);
      if (position) {
        this.antCameraDelta.subVectors(position, this.cameraTween.antAnchor);
        this.cameraTween.toPosition.add(this.antCameraDelta);
        this.cameraTween.toTarget.add(this.antCameraDelta);
        if (surfaceReturn) {
          this.cameraTween.fromPosition.add(this.antCameraDelta);
          this.cameraTween.fromTarget.add(this.antCameraDelta);
        }
        this.cameraTween.antAnchor.copy(position);
      }
    }
    const progress = THREE.MathUtils.clamp(
      (performance.now() - this.cameraTween.startedAt) / this.cameraTween.duration,
      0,
      1,
    );
    const eased = easeInOut(progress);
    this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, eased);
    if (surfaceReturn) {
      const tween = this.cameraTween;
      const fromX = tween.fromPosition.x - tween.fromTarget.x, fromZ = tween.fromPosition.z - tween.fromTarget.z;
      const toX = tween.toPosition.x - tween.toTarget.x, toZ = tween.toPosition.z - tween.toTarget.z;
      const fromYaw = Math.atan2(fromX, fromZ), toYaw = Math.atan2(toX, toZ);
      const yaw = fromYaw + Math.atan2(Math.sin(toYaw - fromYaw), Math.cos(toYaw - fromYaw)) * eased;
      const radius = THREE.MathUtils.lerp(Math.hypot(fromX, fromZ), Math.hypot(toX, toZ), eased);
      const height = THREE.MathUtils.lerp(tween.fromPosition.y - tween.fromTarget.y,
        tween.toPosition.y - tween.toTarget.y, eased);
      // Interpolate the orbit rather than cutting through its center while turning.
      this.camera.position.set(this.controls.target.x + Math.sin(yaw) * radius,
        this.controls.target.y + height, this.controls.target.z + Math.cos(yaw) * radius);
      this.camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.toFov, eased);
      this.camera.updateProjectionMatrix();
    } else this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.toPosition, eased);
    if (this.isAntViewActive()) this.camera.lookAt(this.controls.target);
    if (surfaceReturn) trackGroundOrbit(this, beforeX, beforeZ,
      this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
    if (progress >= 1) {
      this.cameraTween = null;
      if (surfaceReturn) this.clearCameraOrbitMomentum();
    }
  },
};

export function installPondCameraMethods(PondApp) {
  Object.entries(cameraMethods).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
}
