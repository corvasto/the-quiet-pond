import * as THREE from 'three';
import { CAMERA_VIEWS, SCENE_PROPS, getHabitatArea } from '../config/index.js';
import { clampMotionDelta } from '../utils/player-motion.js';

function easeInOut(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

const cameraMethods = {
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
    const beforeRadiusSq = beforeX * beforeX + beforeZ * beforeZ;
    const beforeYaw = Math.atan2(beforeX, beforeZ);
    this.controls.update(delta);
    const afterX = this.camera.position.x - this.controls.target.x;
    const afterZ = this.camera.position.z - this.controls.target.z;
    const afterRadiusSq = afterX * afterX + afterZ * afterZ;
    if (beforeRadiusSq < 0.00000001 || afterRadiusSq < 0.00000001) return;
    const afterYaw = Math.atan2(afterX, afterZ);
    const orbitYaw = Math.atan2(
      Math.sin(afterYaw - beforeYaw),
      Math.cos(afterYaw - beforeYaw),
    );
    // Preserve the held ground heading while camera damping settles after an orbit.
    this.antCameraMovementYaw = (this.antCameraMovementYaw ?? 0) + orbitYaw;
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
    if (this.cameraTween.antAnchor && this.isAntViewActive()) {
      const position = this.getAntWorldPosition(this.antCameraAnchor);
      if (position) {
        this.antCameraDelta.subVectors(position, this.cameraTween.antAnchor);
        this.cameraTween.toPosition.add(this.antCameraDelta);
        this.cameraTween.toTarget.add(this.antCameraDelta);
        this.cameraTween.antAnchor.copy(position);
      }
    }
    const progress = THREE.MathUtils.clamp(
      (performance.now() - this.cameraTween.startedAt) / this.cameraTween.duration,
      0,
      1,
    );
    const eased = easeInOut(progress);
    this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.toPosition, eased);
    this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, eased);
    if (this.isAntViewActive()) this.camera.lookAt(this.controls.target);
    if (progress >= 1) this.cameraTween = null;
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
