import * as THREE from 'three';
import { SCENE_PROPS, getHabitatArea } from '../config/index.js';
import {
  clampMotionDelta,
  clampMovementAxis,
  resolveMovementAxes,
  stepPlanarMotion,
} from '../utils/player-motion.js';

const antNavigationMethods = {
  setAntPose(position, { heading = null, moving = false } = {}) {
    if (
      !this.ant?.group?.parent
      || !Number.isFinite(position?.x)
      || !Number.isFinite(position?.y)
      || !Number.isFinite(position?.z)
    ) return false;
    this.antPoseLocal.copy(position);
    this.ant.group.parent.worldToLocal(this.antPoseLocal);
    this.ant.group.position.copy(this.antPoseLocal);
    if (Number.isFinite(heading)) {
      this.ant.group.rotation.set(
        0,
        heading + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset),
        0,
      );
    }
    this.antWasOnWater = false;
    this.setAntAnimationPlaying(moving);
    return true;
  },

  setAntSurfacePose(position, {
    normal,
    tangent,
    moving = false,
  } = {}) {
    if (
      !this.ant?.group?.parent
      || !Number.isFinite(position?.x)
      || !Number.isFinite(position?.y)
      || !Number.isFinite(position?.z)
      || !Number.isFinite(normal?.x)
      || !Number.isFinite(normal?.y)
      || !Number.isFinite(normal?.z)
      || !Number.isFinite(tangent?.x)
      || !Number.isFinite(tangent?.y)
      || !Number.isFinite(tangent?.z)
    ) return false;

    this.antPoseNormal.copy(normal);
    if (this.antPoseNormal.lengthSq() < 0.000001) return false;
    this.antPoseNormal.normalize();

    this.antPoseForward.copy(tangent).addScaledVector(
      this.antPoseNormal,
      -this.antPoseForward.dot(this.antPoseNormal),
    );
    if (this.antPoseForward.lengthSq() < 0.000001) return false;
    this.antPoseForward.normalize();

    this.antPoseRight.crossVectors(this.antPoseNormal, this.antPoseForward);
    if (this.antPoseRight.lengthSq() < 0.000001) return false;
    this.antPoseRight.normalize();
    this.antPoseForward.crossVectors(this.antPoseRight, this.antPoseNormal).normalize();

    this.antPoseMatrix.makeBasis(
      this.antPoseRight,
      this.antPoseNormal,
      this.antPoseForward,
    );
    this.antPoseWorldQuaternion.setFromRotationMatrix(this.antPoseMatrix);
    this.antPoseYawQuaternion.setFromAxisAngle(
      this.antPoseUp,
      THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset),
    );
    this.antPoseWorldQuaternion.multiply(this.antPoseYawQuaternion);

    this.antPoseLocal.copy(position);
    this.ant.group.parent.worldToLocal(this.antPoseLocal);
    this.ant.group.position.copy(this.antPoseLocal);
    this.ant.group.parent.getWorldQuaternion(this.antPoseParentQuaternion);
    this.ant.group.quaternion.copy(this.antPoseParentQuaternion.invert())
      .multiply(this.antPoseWorldQuaternion);
    this.antWasOnWater = false;
    this.setAntAnimationPlaying(moving);
    return true;
  },

  isAntViewActive() {
    return this.activeView === 'ant';
  },

  setAntMovementKey(direction, pressed) {
    if (!['forward', 'backward', 'left', 'right', 'up', 'down'].includes(direction)) return;
    if (pressed && this.isAntViewActive()) {
      this.antJoystickActive = false;
      this.antMovementInput.add(direction);
    } else {
      this.antMovementInput.delete(direction);
    }
  },

  clearAntMovement() {
    this.antCameraMovementYaw = 0;
    this.antCameraInputAngle = null;
    this.antMovementInput.clear();
    this.antMovementAxes.set(0, 0);
    this.antVelocity.set(0, 0, 0);
    this.antDisplacement.set(0, 0, 0);
    this.setAntRunning(false);
    this.setAntAnimationPlaying(false);
  },

  setAntMovementAxes(horizontal, forward) {
    const active = this.isAntViewActive();
    if (active && (horizontal || forward)) this.antJoystickActive = true;
    this.antMovementAxes.set(
      active ? clampMovementAxis(horizontal) : 0,
      active ? clampMovementAxis(forward) : 0,
    );
  },

  getAntJoystickForward(target) {
    target.subVectors(this.controls.target, this.camera.position).setY(0);
    if (target.lengthSq() < 0.000001) {
      const offset = SCENE_PROPS.ant.cameraOffset;
      target.set(-offset.x, 0, -offset.z);
    }
    return target.normalize();
  },

  getAntMovementAxes() {
    return resolveMovementAxes(
      this.antResolvedAxes,
      Number(this.antMovementInput.has('right')) - Number(this.antMovementInput.has('left')),
      Number(this.antMovementInput.has('forward')) - Number(this.antMovementInput.has('backward')),
      this.antMovementAxes.x,
      this.antMovementAxes.y,
      this.antMovement.analogDeadzone,
    );
  },

  setAntFlightEnabled(enabled, { speedMultiplier = 3 } = {}) {
    this.antFlightEnabled = Boolean(enabled);
    this.antFlightSpeedMultiplier = Math.max(1, Number(speedMultiplier) || 3);
    this.clearAntMovement();
    if (!this.antFlightEnabled && this.ant?.group && this.ground) {
      const { x, z } = this.ant.group.position;
      if (!this.canAntOccupy(x, z)) this.moveAntNear(x, z);
      const support = this.getAntGroundPosition(this.ant.group.position.x, this.ant.group.position.z);
      if (support) this.ant.group.position.y = support.y;
    }
    return this.antFlightEnabled;
  },

  isAntFlightEnabled() {
    return this.antFlightEnabled;
  },

  canAntOccupy(x, z) {
    if (!this.ant || !this.ground) return false;
    const config = SCENE_PROPS.ant;
    const centerDistance = Math.hypot(
      x - this.antMovementCenter.x,
      z - this.antMovementCenter.y,
    );
    if (centerDistance > this.antMovementRadius) return false;
    if (this.antMovementRadiusOverride) {
      const habitat = getHabitatArea(this.settings.area);
      const halfSize = habitat.detailSize * 0.5 - config.collisionRadius;
      if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) return false;
    }

    const treeColliders = this.treeGroundColliders.length > 0
      ? this.treeGroundColliders
      : [
        {
          x: this.propHeroPosition.x,
          z: this.propHeroPosition.z,
          radius: config.treeCollisionRadius,
        },
        ...this.companionTreeColliders,
      ];
    if (treeColliders.some((collider) => {
      const containsGroundPoint = collider.footprint?.containsGroundPoint;
      if (containsGroundPoint) return containsGroundPoint(x, z, config.collisionRadius);
      return Math.hypot(x - collider.x, z - collider.z)
        < collider.radius + config.collisionRadius;
    })) return false;
    if (this.ground.containsRock?.(x, z, config.collisionRadius)) return false;
    if (this.modelGroundColliders.some((collider) => (
      collider.blocksGround
      && collider.footprint.containsGroundPoint(x, z, config.collisionRadius)
    ))) return false;

    if (this.reader?.group.parent) {
      const containsReaderPoint = this.readerSurfaceProxy?.userData.containsGroundPoint;
      if (containsReaderPoint?.(x, z, config.collisionRadius)) return false;
      const bounds = this.readerCollisionBounds;
      if (!containsReaderPoint && !bounds.isEmpty()) {
        const collisionScale = THREE.MathUtils.clamp(
          Number(SCENE_PROPS.reader.collisionScale) || 0.68,
          0.2,
          1,
        );
        const centerX = (bounds.min.x + bounds.max.x) * 0.5;
        const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
        const radiusX = (bounds.max.x - bounds.min.x) * 0.5 * collisionScale
          + config.collisionRadius;
        const radiusZ = (bounds.max.z - bounds.min.z) * 0.5 * collisionScale
          + config.collisionRadius;
        const normalizedX = (x - centerX) / Math.max(radiusX, 0.001);
        const normalizedZ = (z - centerZ) / Math.max(radiusZ, 0.001);
        if (normalizedX * normalizedX + normalizedZ * normalizedZ < 1) return false;
      }
    }
    return true;
  },

  isAntTravelPathClear(startX, startZ, endX, endZ) {
    const distance = Math.hypot(endX - startX, endZ - startZ);
    const sampleSpacing = Math.max(
      0.012,
      SCENE_PROPS.ant.collisionRadius * 0.45,
    );
    const samples = Math.max(1, Math.ceil(distance / sampleSpacing));
    for (let index = 1; index <= samples; index += 1) {
      const amount = index / samples;
      if (!this.canAntOccupy(
        THREE.MathUtils.lerp(startX, endX, amount),
        THREE.MathUtils.lerp(startZ, endZ, amount),
      )) return false;
    }
    return true;
  },

  enforceGameGroundBlockers() {
    if (
      this.antFlightEnabled
      || this.antMotionLocked
      || !this.ant?.group
      || this.gameGroundBlockers.size === 0
    ) return false;
    const config = SCENE_PROPS.ant;
    const { x, z } = this.ant.group.position;
    for (const blocker of this.gameGroundBlockers.values()) {
      const radiusX = blocker.radiusX + config.collisionRadius;
      const radiusZ = blocker.radiusZ + config.collisionRadius;
      const offsetX = (x - blocker.x) / radiusX;
      const offsetZ = (z - blocker.z) / radiusZ;
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared >= 1) continue;
      const distance = Math.sqrt(distanceSquared);
      const directionX = distance > 0.0001 ? offsetX / distance : 0;
      const directionZ = distance > 0.0001 ? offsetZ / distance : -1;
      return this.moveAntTo(
        blocker.x + directionX * radiusX * 1.015,
        blocker.z + directionZ * radiusZ * 1.015,
        { validatePath: false },
      );
    }
    return false;
  },

  moveAntTo(x, z, { validatePath = true } = {}) {
    if (!this.canAntOccupy(x, z)) return false;
    const previousX = this.ant.group.position.x;
    const previousZ = this.ant.group.position.z;
    if (
      validatePath
      && this.canAntOccupy(previousX, previousZ)
      && !this.isAntTravelPathClear(previousX, previousZ, x, z)
    ) return false;
    const movementDistance = Math.hypot(x - previousX, z - previousZ);
    const onWater = this.ground.containsPond?.(x, z, -0.045) ?? false;
    if (onWater && this.activePondWater) {
      this.antWaterStepDistance += movementDistance;
      if (!this.antWasOnWater) {
        this.activePondWater.addRipple(x, z, 0.012, 0.14);
        this.antWaterStepDistance = 0;
      } else if (this.antWaterStepDistance >= 0.055) {
        const side = this.antWaterStepSide;
        this.antWaterStepSide *= -1;
        this.activePondWater.addRipple(
          x + this.antRight.x * side * 0.026,
          z + this.antRight.z * side * 0.026,
          0.0045,
          0.075,
        );
        this.antWaterStepDistance = 0;
      }
    } else {
      this.antWaterStepDistance = 0;
    }
    this.antWasOnWater = onWater;
    const supportHeight = onWater && this.activePondWater
      ? this.activePondWater.getSurfaceHeight(x, z) + 0.008
      : this.ground.heightAt(x, z);
    this.ant.group.position.set(
      x,
      supportHeight + SCENE_PROPS.ant.lift + SCENE_PROPS.ant.offset.y,
      z,
    );
    return true;
  },

  recoverAntFromCollision() {
    if (!this.ant?.group || !this.ground) return false;
    const { x, z } = this.ant.group.position;
    if (this.canAntOccupy(x, z)) return true;

    const collisionRadius = SCENE_PROPS.ant.collisionRadius;
    const containingCollider = [
      ...this.treeGroundColliders,
      ...this.modelGroundColliders.filter((collider) => collider.blocksGround),
    ].find((collider) => (
      collider.footprint?.containsGroundPoint?.(x, z, collisionRadius)
      || Math.hypot(x - collider.x, z - collider.z) < collider.radius + collisionRadius
    ));
    const preferredAngle = containingCollider
      ? Math.atan2(x - containingCollider.x, z - containingCollider.z)
      : 0;
    const maximumRecoveryDistance = Math.min(
      4,
      Math.max(1.2, (containingCollider?.radius ?? 0) + 0.3),
    );
    const angleOffsets = [
      0,
      Math.PI * 0.125,
      -Math.PI * 0.125,
      Math.PI * 0.25,
      -Math.PI * 0.25,
      Math.PI * 0.375,
      -Math.PI * 0.375,
      Math.PI * 0.5,
      -Math.PI * 0.5,
      Math.PI * 0.75,
      -Math.PI * 0.75,
      Math.PI,
    ];
    for (let distance = 0.02; distance <= maximumRecoveryDistance; distance += 0.02) {
      for (const angleOffset of angleOffsets) {
        const angle = preferredAngle + angleOffset;
        const candidateX = x + Math.sin(angle) * distance;
        const candidateZ = z + Math.cos(angle) * distance;
        if (this.moveAntTo(candidateX, candidateZ, { validatePath: false })) return true;
      }
    }
    return false;
  },

  moveAntNear(x, z, { maximumSearchDistance = 1.2 } = {}) {
    if (this.moveAntTo(x, z, { validatePath: false })) return true;
    const antPosition = this.getAntWorldPosition(this.antDebugPosition);
    const preferredAngle = antPosition
      ? Math.atan2(antPosition.x - x, antPosition.z - z)
      : 0;
    const angleOffsets = [
      0,
      Math.PI * 0.25,
      -Math.PI * 0.25,
      Math.PI * 0.5,
      -Math.PI * 0.5,
      Math.PI * 0.75,
      -Math.PI * 0.75,
      Math.PI,
    ];
    const safeMaximumDistance = THREE.MathUtils.clamp(
      Number(maximumSearchDistance) || 1.2,
      0.12,
      2.4,
    );
    for (let distance = 0.06; distance <= safeMaximumDistance; distance += 0.06) {
      for (const angleOffset of angleOffsets) {
        const angle = preferredAngle + angleOffset;
        if (this.moveAntTo(
          x + Math.sin(angle) * distance,
          z + Math.cos(angle) * distance,
          { validatePath: false },
        )) return true;
      }
    }
    return false;
  },

  updateAntSurfaceHeight() {
    if (this.antMotionLocked || this.antFlightEnabled || !this.ant || !this.activePondWater || !this.ground) return;
    const { x, z } = this.ant.group.position;
    if (!this.ground.containsPond?.(x, z, -0.045)) return;
    this.ant.group.position.y = this.activePondWater.getSurfaceHeight(x, z)
      + 0.008
      + SCENE_PROPS.ant.lift
      + SCENE_PROPS.ant.offset.y;
  },

  updateAntMovement(delta) {
    if (!this.isAntViewActive() || !this.ant || !this.ground) return;
    if (this.antMotionLocked) return;
    const dt = clampMotionDelta(delta);
    if (dt === 0) return;
    if (this.antFlightEnabled) {
      this.updateAntFlightMovement(dt);
      return;
    }
    if (!this.recoverAntFromCollision()) {
      this.setAntAnimationPlaying(false);
      return;
    }
    const axes = this.getAntMovementAxes();
    const inputAngle = axes.magnitude > 0 ? Math.atan2(axes.x, axes.y) : null;
    const inputTurn = inputAngle !== null && this.antCameraInputAngle != null
      ? Math.atan2(Math.sin(inputAngle - this.antCameraInputAngle), Math.cos(inputAngle - this.antCameraInputAngle))
      : Infinity;
    if (inputAngle === null || Math.abs(inputTurn) > 0.15) {
      this.antCameraMovementYaw = 0;
      this.antCameraInputAngle = inputAngle;
    }
    if (axes.magnitude === 0 && this.antVelocity.lengthSq() === 0) {
      this.setAntAnimationPlaying(false);
      return;
    }

    this.antForward
      .subVectors(this.controls.target, this.camera.position)
      .setY(0);
    if (this.antForward.lengthSq() < 0.000001) {
      const offset = SCENE_PROPS.ant.cameraOffset;
      this.antForward.set(-offset.x, 0, -offset.z);
    }
    this.antForward.normalize();
    // Camera orbit must not steer an unchanged held movement input.
    const movementYaw = -(this.antCameraMovementYaw ?? 0);
    const forwardX = this.antForward.x;
    const forwardZ = this.antForward.z;
    this.antForward.x = forwardX * Math.cos(movementYaw) + forwardZ * Math.sin(movementYaw);
    this.antForward.z = forwardZ * Math.cos(movementYaw) - forwardX * Math.sin(movementYaw);
    if (this.antMovementAxes.lengthSq() > this.antMovement.analogDeadzone ** 2) {
      this.getAntJoystickForward(this.antForward);
    }
    this.antRight.set(-this.antForward.z, 0, this.antForward.x);
    this.antMoveDirection
      .copy(this.antForward)
      .multiplyScalar(axes.y)
      .addScaledVector(this.antRight, axes.x);

    if (axes.magnitude > 0) {
      const targetYaw = Math.atan2(this.antMoveDirection.x, this.antMoveDirection.z)
        + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
      const yawDifference = Math.atan2(
        Math.sin(targetYaw - this.ant.group.rotation.y),
        Math.cos(targetYaw - this.ant.group.rotation.y),
      );
      this.ant.group.rotation.y += yawDifference
        * (1 - Math.exp(-this.antMovement.turnResponsiveness * dt));
    }

    const speed = SCENE_PROPS.ant.moveSpeed
      * (this.antRunEnabled ? SCENE_PROPS.ant.runMultiplier : 1);
    stepPlanarMotion(
      this.antVelocity,
      this.antDisplacement,
      this.antMoveDirection.x * speed,
      this.antMoveDirection.z * speed,
      this.antMovement.acceleration,
      this.antMovement.braking,
      dt,
    );
    const startX = this.ant.group.position.x;
    const startZ = this.ant.group.position.z;
    const nextX = startX + this.antDisplacement.x;
    const nextZ = startZ + this.antDisplacement.z;
    if (!this.moveAntTo(nextX, nextZ)) {
      const movedX = this.moveAntTo(nextX, startZ);
      if (!movedX) this.moveAntTo(startX, nextZ);
    }
    const movedX = Math.abs(this.ant.group.position.x - startX) > 0.00000001;
    const movedZ = Math.abs(this.ant.group.position.z - startZ) > 0.00000001;
    if (!movedX) this.antVelocity.x = 0;
    if (!movedZ) this.antVelocity.z = 0;
    this.setAntAnimationPlaying(movedX || movedZ);
  },

  updateAntFlightMovement(delta) {
    const axes = this.getAntMovementAxes();
    const altitude = Number(this.antMovementInput.has('up'))
      - Number(this.antMovementInput.has('down'));
    const hasMovementInput = axes.magnitude > 0 || altitude !== 0;
    this.setAntAnimationPlaying(false);
    if (!hasMovementInput) return;

    this.antForward.subVectors(this.controls.target, this.camera.position).setY(0);
    if (this.antForward.lengthSq() < 0.000001) this.antForward.set(0, 0, -1);
    this.antForward.normalize();
    if (this.antMovementAxes.lengthSq() > this.antMovement.analogDeadzone ** 2) {
      this.getAntJoystickForward(this.antForward);
    }
    this.antRight.set(-this.antForward.z, 0, this.antForward.x);
    this.antMoveDirection.copy(this.antForward).multiplyScalar(axes.y)
      .addScaledVector(this.antRight, axes.x)
      .setY(altitude);
    if (this.antMoveDirection.lengthSq() > 1) this.antMoveDirection.normalize();

    const distance = SCENE_PROPS.ant.moveSpeed * this.antFlightSpeedMultiplier * clampMotionDelta(delta);
    this.ant.group.position.x += this.antMoveDirection.x * distance;
    this.ant.group.position.z += this.antMoveDirection.z * distance;
    this.ant.group.position.y += this.antMoveDirection.y * distance;
    if (this.antMoveDirection.x * this.antMoveDirection.x + this.antMoveDirection.z * this.antMoveDirection.z > 0.000001) {
      this.ant.group.rotation.y = Math.atan2(this.antMoveDirection.x, this.antMoveDirection.z)
        + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
    }
  },
};

export function installPondAntNavigationMethods(PondApp) {
  Object.entries(antNavigationMethods).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
}
