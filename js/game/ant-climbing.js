import * as THREE from 'three';
import { POND_GAME } from '../config/game.js';
import { clampMotionDelta, clampMovementAxis, resolveMovementAxes } from '../utils/player-motion.js';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const EPSILON = 0.0001;
const ENTRY_HEIGHT_FACTORS = Object.freeze([0.15, 0.42, 0.7, 1]);
const ENTRY_LATERAL_FACTORS = Object.freeze([0, 0.55, -0.55]);

function horizontalDistance(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function containsFootprint(footprint, x, z, padding = 0) {
  if (!footprint) return false;
  if (Number.isFinite(footprint.radius)) {
    return Math.hypot(x - footprint.x, z - footprint.z)
      <= footprint.radius + padding;
  }
  if (!Number.isFinite(footprint.radiusX) || !Number.isFinite(footprint.radiusZ)) {
    return false;
  }
  const deltaX = x - footprint.x;
  const deltaZ = z - footprint.z;
  const cosine = Number.isFinite(footprint.cosine) ? footprint.cosine : 1;
  const sine = Number.isFinite(footprint.sine) ? footprint.sine : 0;
  const localX = deltaX * cosine + deltaZ * sine;
  const localZ = -deltaX * sine + deltaZ * cosine;
  const radiusX = Math.max(0.001, footprint.radiusX + padding);
  const radiusZ = Math.max(0.001, footprint.radiusZ + padding);
  return localX * localX / (radiusX * radiusX)
    + localZ * localZ / (radiusZ * radiusZ) <= 1;
}

function centerOfBounds(bounds, target = new THREE.Vector3()) {
  return target.set(
    (bounds.min.x + bounds.max.x) * 0.5,
    (bounds.min.y + bounds.max.y) * 0.5,
    (bounds.min.z + bounds.max.z) * 0.5,
  );
}

function belongsToSurfaceObject(object, surfaceObject) {
  for (let current = object; current; current = current.parent) {
    if (current === surfaceObject) return true;
  }
  return false;
}

function isSameRock(left, right) {
  if (!left || !right) return false;
  return left.surfaceObject === right.surfaceObject
    && left.rockIndex === right.rockIndex
    && left.source === right.source;
}

function projectOntoPlane(vector, normal, target = new THREE.Vector3()) {
  target.copy(vector).addScaledVector(normal, -vector.dot(normal));
  if (target.lengthSq() < EPSILON) return null;
  return target.normalize();
}

export class AntClimbing {
  constructor(app, { onPromptChange = () => {} } = {}) {
    this.app = app;
    this.onPromptChange = onPromptChange;
    this.landmarks = null;
    this.route = null;
    this.nearbyRoute = null;
    this.nearbyContact = null;
    this.phase = 'ground';
    this.surfaceRole = null;
    this.paused = false;
    this.exploreActive = false;
    this.input = new Set();
    this.movementAxes = new THREE.Vector2();
    this.resolvedAxes = { x: 0, y: 0, magnitude: 0 };
    this.unsubscribe = null;
    this.currentPrompt = '';
    this.detectionElapsed = Infinity;
    this.contactMarkerElapsed = 0;
    this.contactMarkerHoldRemaining = 0;
    this.passiveProbeCursorByRoute = new Map();

    this.antPosition = new THREE.Vector3();
    this.antHeadPosition = new THREE.Vector3();
    this.antFacing = new THREE.Vector3();
    this.entryDirection = new THREE.Vector3();
    this.entryBaseDirection = new THREE.Vector3();
    this.surfacePoint = new THREE.Vector3();
    this.surfaceNormal = new THREE.Vector3(0, 1, 0);
    this.surfaceTangent = new THREE.Vector3(0, 0, 1);
    this.surfacePose = new THREE.Vector3();
    this.surfaceCandidate = new THREE.Vector3();
    this.surfaceOrigin = new THREE.Vector3();
    this.surfaceRayDirection = new THREE.Vector3();
    this.surfaceHitPosition = new THREE.Vector3();
    this.surfaceHitNormal = new THREE.Vector3();
    this.raycastBestPosition = new THREE.Vector3();
    this.raycastBestNormal = new THREE.Vector3();
    this.neighborSurfaceOrigin = new THREE.Vector3();
    this.neighborSurfacePosition = new THREE.Vector3();
    this.neighborSurfaceNormal = new THREE.Vector3();
    this.exteriorCandidatePosition = new THREE.Vector3();
    this.exteriorCandidateNormal = new THREE.Vector3();
    this.exteriorDirection = new THREE.Vector3();
    this.exteriorRayDirection = new THREE.Vector3();
    this.exteriorOrigin = new THREE.Vector3();
    this.exteriorBestPosition = new THREE.Vector3();
    this.exteriorBestNormal = new THREE.Vector3();
    this.debugInstanceMatrix = new THREE.Matrix4();
    this.surfaceBestPosition = new THREE.Vector3();
    this.surfaceBestNormal = new THREE.Vector3();
    this.surfaceBestRole = null;
    this.guidedBestPosition = new THREE.Vector3();
    this.guidedBestNormal = new THREE.Vector3();
    this.guidedBestDirection = new THREE.Vector3();
    this.guidedDirection = new THREE.Vector3();
    this.surfaceMove = new THREE.Vector3();
    this.surfaceDelta = new THREE.Vector3();
    this.surfaceForward = new THREE.Vector3();
    this.surfaceRight = new THREE.Vector3();
    this.cameraForward = new THREE.Vector3();
    this.groundPoint = new THREE.Vector3();
    this.contactMarkerPosition = new THREE.Vector3();
    this.lastHeading = 0;

    this.gameplayContactMarker = null;

    this.debugEnabled = POND_GAME.debug?.enabled === true;
    this.debugGroup = null;
    this.debugHeadMarker = null;
    this.debugRangeRing = null;
    this.debugContactMarker = null;
    this.debugValidProbes = null;
    this.debugRejectedProbes = null;
    this.debugContactAxes = null;
    this.debugTrail = null;
    this.debugSurfaceMask = null;
    this.debugValidSegments = [];
    this.debugRejectedSegments = [];
    this.debugTrailPoints = [];
  }

  start() {
    this.landmarks = this.app.getSceneLandmarks();
    this.setupGameplayContactMarker();
    if (this.debugEnabled) this.setupDebugOverlay();
    this.unsubscribe = this.app.onFrame((frame) => this.update(frame));
  }

  isClimbing() {
    return this.phase === 'surface' && Boolean(this.route);
  }

  isDebugEnabled() {
    return this.debugEnabled;
  }

  setDebugOverlayVisible(visible) {
    if (this.debugGroup) this.debugGroup.visible = Boolean(visible);
  }

  exitSurfaceForDebug() {
    if (!this.isClimbing()) return true;
    const landing = this.findDismountPosition() ?? this.route?.entry?.clone();
    if (!landing) return false;
    this.finishRoute(landing);
    return true;
  }

  handleAntRelocated() {
    this.clearMovementInput();
    this.nearbyRoute = null;
    this.nearbyContact = null;
    this.clearGameplayContactMarker();
    this.detectionElapsed = Infinity;
    this.resetDebugTrail();
    this.app.setAntAnimationPlaying(false);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.clearMovementInput();
    this.app.setAntAnimationPlaying(false);
  }

  setExploreActive(active) {
    this.exploreActive = Boolean(active);
    this.clearMovementInput();
    this.app.setAntAnimationPlaying(false);
    if (this.exploreActive) {
      this.nearbyRoute = null;
      this.nearbyContact = null;
      this.clearGameplayContactMarker();
      this.setPrompt('');
    }
  }

  setMovementKey(direction, pressed) {
    if (!['forward', 'backward', 'left', 'right'].includes(direction)) return this.phase === 'surface';
    if (this.paused || this.exploreActive) pressed = false;
    if (pressed) this.input.add(direction);
    else this.input.delete(direction);
    return this.phase === 'surface';
  }

  setMovementAxes(horizontal, forward) {
    const blocked = this.paused || this.exploreActive;
    this.movementAxes.set(
      blocked ? 0 : clampMovementAxis(horizontal),
      blocked ? 0 : clampMovementAxis(forward),
    );
  }

  clearMovementInput() {
    this.input.clear();
    this.movementAxes.set(0, 0);
    this.app.setAntAnimationPlaying(false);
  }

  update({ delta = 0 } = {}) {
    this.updateGameplayContactMarker(delta);
    this.updateDebugAnchor();
    if (this.paused || this.exploreActive) return;
    if (this.phase === 'ground') {
      this.detectionElapsed += Math.max(0, Math.min(delta, 0.05));
      const detectionInterval = Math.max(
        0.08,
        Number(POND_GAME.climbing.entryDetectionInterval) || 0.18,
      );
      if (this.detectionElapsed >= detectionInterval) {
        this.detectionElapsed = 0;
        this.refreshNearbyRoute();
      }
      return;
    }
    this.updateSurfaceMovement(delta);
  }

  toggleSurfaceRoam() {
    if (this.phase === 'surface') {
      if (this.route?.id === 'radio' && !this.isOnRadioSupportSurface()) {
        const movedToSupport = this.tryRadioSupportDismount();
        if (movedToSupport) return true;
        // Do not let a failed radio-to-support probe fall through to the
        // generic dismount. The radio remains the active route until a valid
        // support contact is found.
        return false;
      }
      const radioTransfer = this.tryRadioModelTransfer();
      if (radioTransfer !== null) return radioTransfer;
      return this.dismount();
    }
    return this.beginSurfaceRoam();
  }

  beginSurfaceRoam() {
    if (
      this.paused
      || this.exploreActive
      || this.phase !== 'ground'
    ) return false;

    this.refreshNearbyRoute({ exhaustive: true });
    const candidate = this.nearbyRoute;
    const contact = this.nearbyContact;
    if (!candidate || !contact) {
      this.setPrompt(`Move the ant's head closer to a climbable surface, then use the climb action.`);
      return false;
    }

    const facing = this.app.getAntFacingDirection(this.antFacing);
    if (facing) this.lastHeading = Math.atan2(facing.x, facing.z);
    const groundEntry = this.app.getAntGroundPosition(
      this.antPosition.x,
      this.antPosition.z,
      new THREE.Vector3(),
    ) ?? this.antPosition.clone();
    this.route = { ...candidate, entry: groundEntry };
    this.nearbyRoute = null;
    this.nearbyContact = null;
    this.clearGameplayContactMarker();
    this.phase = 'surface';
    this.surfacePoint.copy(contact.position);
    this.surfaceNormal.copy(contact.normal).normalize();
    this.surfaceTangent.copy(contact.tangent).normalize();
    this.surfaceRole = contact.role ?? null;
    this.app.setAntMotionLocked(true);

    if (!this.applySurfacePose(false)) {
      this.abortRoute(`Could not stand on ${candidate.label}.`);
      return false;
    }
    this.app.setAntAnimationPlaying(false);
    this.resetDebugTrail();
    this.appendDebugTrail(this.surfacePose);
    this.updateDebugContact(contact);
    this.setPrompt(this.getSurfacePrompt());
    return true;
  }

  updateSurfaceMovement(delta) {
    if (!this.route) return;
    const axes = resolveMovementAxes(
      this.resolvedAxes,
      Number(this.input.has('right')) - Number(this.input.has('left')),
      Number(this.input.has('forward')) - Number(this.input.has('backward')),
      this.movementAxes.x,
      this.movementAxes.y,
      POND_GAME.antMovement.analogDeadzone,
    );
    const horizontal = axes.x;
    const vertical = axes.y;
    if (axes.magnitude === 0) {
      this.app.setAntAnimationPlaying(false);
      return;
    }

    let direction = this.getSurfaceMoveDirection(horizontal, vertical);
    if (!direction) {
      this.app.setAntAnimationPlaying(false);
      return;
    }

    const distance = POND_GAME.climbing.speed * axes.magnitude * clampMotionDelta(delta);
    if (distance <= EPSILON) return;
    this.surfaceCandidate.copy(this.surfacePoint).addScaledVector(direction, distance);
    let nextContact = this.findAdjacentContact(this.surfaceCandidate, direction, distance);
    const mostlyForward = Math.abs(horizontal) <= Math.abs(vertical) * 0.3;
    if (!nextContact && mostlyForward && vertical > 0) {
      const guidedContact = this.findGuidedTreeRootContact(distance)
        ?? this.findTreeRootBridgeContact()
        ?? this.findGuidedTentContact(direction, distance);
      if (guidedContact) {
        direction = guidedContact.direction;
        nextContact = guidedContact;
      }
    }
    if (!nextContact && mostlyForward && vertical < 0) {
      const supportContact = this.findRadioSupportTransition();
      if (supportContact) {
        direction = supportContact.direction;
        nextContact = supportContact;
      }
    }
    if (nextContact) {
      this.surfacePoint.copy(nextContact.position);
      this.surfaceNormal.copy(nextContact.normal).normalize();
      if (nextContact.role) this.surfaceRole = nextContact.role;
      const tangent = projectOntoPlane(direction, this.surfaceNormal, this.surfaceTangent)
        ?? projectOntoPlane(UP, this.surfaceNormal, this.surfaceTangent);
      if (!tangent) {
        this.app.setAntAnimationPlaying(false);
        return;
      }
      if (!this.applySurfacePose(true)) {
        this.abortRoute(`Lost the roaming surface on ${this.route.label}.`);
        return;
      }
      this.app.setAntAnimationPlaying(true);
      this.appendDebugTrail(this.surfacePose);
      this.updateDebugContact({
        position: this.surfacePoint,
        normal: this.surfaceNormal,
        tangent: this.surfaceTangent,
      });
      return;
    }

    this.app.setAntAnimationPlaying(false);
  }

  getSurfaceMoveDirection(horizontal, vertical) {
    const routeConfig = POND_GAME.climbing[this.route?.configId ?? this.route?.id] ?? {};
    const verticalClimbNormalYThreshold = Number.isFinite(
      Number(routeConfig.verticalClimbNormalYThreshold),
    )
      ? THREE.MathUtils.clamp(Number(routeConfig.verticalClimbNormalYThreshold), 0.4, 0.98)
      : 0.62;
    const ledgeNormalYThreshold = Number.isFinite(Number(routeConfig.ledgeNormalYThreshold))
      ? THREE.MathUtils.clamp(Number(routeConfig.ledgeNormalYThreshold), 0.4, 0.98)
      : verticalClimbNormalYThreshold;
    const routeBounds = this.route?.bounds;
    const routeCenterLedgeMaximumHeightFraction = THREE.MathUtils.clamp(
      Number(routeConfig.routeCenterLedgeMaximumHeightFraction) || 1,
      0.05,
      1,
    );
    const belowRouteCenterLedgeLimit = !routeBounds
      || this.surfacePoint.y <= routeBounds.min.y
        + (routeBounds.max.y - routeBounds.min.y) * routeCenterLedgeMaximumHeightFraction;
    if (
      routeConfig.preferRouteCenterOnLedges === true
      && belowRouteCenterLedgeLimit
      && this.surfaceNormal.y >= ledgeNormalYThreshold
    ) {
      this.surfaceForward.subVectors(this.route.center, this.surfacePoint).setY(0);
      if (!projectOntoPlane(this.surfaceForward, this.surfaceNormal, this.surfaceForward)) {
        this.surfaceForward.copy(this.surfaceTangent);
      }
    } else if (this.surfaceNormal.y < verticalClimbNormalYThreshold) {
      if (!projectOntoPlane(UP, this.surfaceNormal, this.surfaceForward)) {
        this.surfaceForward.copy(this.surfaceTangent);
      }
    } else {
      this.cameraForward
        .subVectors(this.app.controls.target, this.app.camera.position);
      if (this.movementAxes.lengthSq() > POND_GAME.antMovement.analogDeadzone ** 2) {
        this.app.getAntJoystickForward(this.cameraForward);
      }
      if (!projectOntoPlane(this.cameraForward, this.surfaceNormal, this.surfaceForward)) {
        this.surfaceForward.copy(this.surfaceTangent);
      }
    }

    this.surfaceRight.crossVectors(this.surfaceForward, this.surfaceNormal);
    if (this.surfaceRight.lengthSq() < EPSILON) return null;
    this.surfaceRight.normalize();
    this.surfaceMove.copy(this.surfaceForward)
      .multiplyScalar(vertical)
      .addScaledVector(this.surfaceRight, horizontal);
    if (this.surfaceMove.lengthSq() < EPSILON) return null;
    return this.surfaceMove.normalize();
  }

  findGuidedTreeRootContact(distance) {
    const routeConfig = POND_GAME.climbing[this.route?.configId ?? this.route?.id] ?? {};
    const treeBaseRadius = Number(this.route?.tree?.baseRadius);
    if (
      this.route?.kind !== 'tree'
      || routeConfig.steerOuterRootsToCenter !== true
      || !Number.isFinite(treeBaseRadius)
      || !this.route?.bounds
    ) return null;
    const maximumHeightFraction = THREE.MathUtils.clamp(
      Number(routeConfig.rootGuideMaximumHeightFraction) || 0.1,
      0.02,
      0.3,
    );
    const maximumHeight = this.route.bounds.min.y
      + (this.route.bounds.max.y - this.route.bounds.min.y) * maximumHeightFraction;
    const currentRadius = horizontalDistance(this.surfacePoint, this.route.center);
    if (
      this.surfacePoint.y > maximumHeight
      || currentRadius <= treeBaseRadius
        + THREE.MathUtils.clamp(
          Number(routeConfig.rootGuideRadiusPadding) || 0,
          -treeBaseRadius * 0.35,
          0.4,
        )
    ) return null;

    this.guidedDirection.subVectors(this.route.center, this.surfacePoint).setY(0);
    if (this.guidedDirection.lengthSq() < EPSILON) return null;
    this.guidedDirection.normalize();
    const angleOffsets = [
      -15, 15,
      -30, 30,
      -45, 45,
      -60, 60,
      -75, 75,
      -90, 90,
    ];
    for (const angleOffset of angleOffsets) {
      this.guidedDirection.applyAxisAngle(UP, THREE.MathUtils.degToRad(angleOffset));
      const projectedDirection = projectOntoPlane(
        this.guidedDirection,
        this.surfaceNormal,
        this.surfaceMove,
      );
      this.guidedDirection.applyAxisAngle(UP, -THREE.MathUtils.degToRad(angleOffset));
      if (!projectedDirection) continue;
      this.surfaceCandidate.copy(this.surfacePoint).addScaledVector(projectedDirection, distance);
      const contact = this.findAdjacentContact(
        this.surfaceCandidate,
        projectedDirection,
        distance,
      );
      if (!contact) continue;
      const nextRadius = horizontalDistance(contact.position, this.route.center);
      if (nextRadius >= currentRadius - distance * 0.01) continue;
      this.guidedBestPosition.copy(contact.position);
      this.guidedBestNormal.copy(contact.normal);
      this.guidedBestDirection.copy(projectedDirection);
      return {
        position: this.guidedBestPosition,
        normal: this.guidedBestNormal,
        direction: this.guidedBestDirection,
      };
    }
    return null;
  }

  findTreeRootBridgeContact() {
    const routeConfig = POND_GAME.climbing[this.route?.configId ?? this.route?.id] ?? {};
    const treeBaseRadius = Number(this.route?.tree?.baseRadius);
    if (
      this.route?.kind !== 'tree'
      || !Number.isFinite(treeBaseRadius)
      || !this.route?.bounds
    ) return null;
    const currentRadius = horizontalDistance(this.surfacePoint, this.route.center);
    if (
      currentRadius > treeBaseRadius
        + Math.max(0.08, Number(routeConfig.rootBridgeRadiusPadding) || 0.24)
      || this.surfacePoint.y > this.route.bounds.min.y
        + (this.route.bounds.max.y - this.route.bounds.min.y) * 0.1
    ) return null;

    this.entryBaseDirection.subVectors(this.surfacePoint, this.route.center).setY(0);
    if (this.entryBaseDirection.lengthSq() < EPSILON) return null;
    this.entryBaseDirection.normalize();
    const maximumDistance = Math.max(
      0.08,
      Number(routeConfig.rootBridgeMaximumDistance) || 0.24,
    );
    const castRadius = treeBaseRadius + 0.4;
    const angleOffsets = [
      0,
      -6, 6,
      -12, 12,
      -18, 18,
      -24, 24,
      -30, 30,
      -36, 36,
      -45, 45,
    ];
    const heightOffsets = [0.02, 0.06, 0.12, 0.18];
    for (const angleOffset of angleOffsets) {
      const angle = THREE.MathUtils.degToRad(angleOffset);
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      this.entryDirection.set(
        this.entryBaseDirection.x * cosine - this.entryBaseDirection.z * sine,
        0,
        this.entryBaseDirection.x * sine + this.entryBaseDirection.z * cosine,
      ).normalize();
      for (const heightOffset of heightOffsets) {
        this.surfaceOrigin.copy(this.route.center)
          .setY(this.surfacePoint.y + heightOffset)
          .addScaledVector(this.entryDirection, castRadius);
        const hit = this.raycastRouteSurface(
          this.surfaceOrigin,
          this.surfaceRayDirection.copy(this.entryDirection).negate(),
        );
        if (!hit || !this.isSafeContact(hit, -0.75)) continue;
        const bridgeDistance = hit.position.distanceTo(this.surfacePoint);
        if (
          bridgeDistance > maximumDistance
          || horizontalDistance(hit.position, this.route.center) >= currentRadius
        ) continue;
        this.guidedBestPosition.copy(hit.position);
        this.guidedBestNormal.copy(hit.normal);
        this.guidedBestDirection.subVectors(hit.position, this.surfacePoint).normalize();
        return {
          position: this.guidedBestPosition,
          normal: this.guidedBestNormal,
          direction: this.guidedBestDirection,
        };
      }
    }
    return null;
  }

  findRadioSupportTransition({
    maximumDistance: requestedMaximumDistance = null,
    outwardOffsets: requestedOutwardOffsets = null,
    angleOffsetsDegrees = [0],
  } = {}) {
    if (this.route?.id !== 'radio') return null;
    const supportSurface = this.route.surfaces?.find((surface) => surface.role === 'support');
    const footprint = this.route.model?.groundFootprint;
    if (!supportSurface?.object || !footprint?.containsGroundPoint) return null;

    this.entryBaseDirection.copy(this.surfaceNormal).setY(0);
    if (this.entryBaseDirection.lengthSq() < EPSILON) {
      this.entryBaseDirection.subVectors(this.surfacePoint, this.route.center).setY(0);
    }
    if (this.entryBaseDirection.lengthSq() < EPSILON) {
      this.entryBaseDirection.copy(this.surfaceTangent).setY(0);
    }
    if (this.entryBaseDirection.lengthSq() < EPSILON) return null;
    this.entryBaseDirection.normalize();
    const routeConfig = POND_GAME.climbing.radio ?? {};
    const maximumDistance = Math.max(
      0.08,
      Number(requestedMaximumDistance)
        || Number(routeConfig.supportTransitionMaximumDistance)
        || 0.22,
    );
    const outwardOffsets = requestedOutwardOffsets ?? [0.035, 0.07, 0.11, 0.15, 0.2];
    for (const angleOffsetDegrees of angleOffsetsDegrees) {
      this.entryDirection.copy(this.entryBaseDirection).applyAxisAngle(
        UP,
        THREE.MathUtils.degToRad(Number(angleOffsetDegrees) || 0),
      );
      for (const outwardOffset of outwardOffsets) {
        this.surfaceCandidate.copy(this.surfacePoint)
          .addScaledVector(this.entryDirection, outwardOffset);
        if (footprint.containsGroundPoint(
          this.surfaceCandidate.x,
          this.surfaceCandidate.z,
          0.012,
        )) continue;
        this.surfaceOrigin.copy(this.surfaceCandidate).addScaledVector(UP, 0.28);
        const hit = this.raycastRouteSurface(
          this.surfaceOrigin,
          DOWN,
          this.route,
          [supportSurface],
        );
        if (
          !hit
          || hit.normal.y < 0.3
          || hit.position.y > this.surfacePoint.y + 0.04
          || hit.position.distanceTo(this.surfacePoint) > maximumDistance
        ) continue;
        this.guidedBestPosition.copy(hit.position);
        this.guidedBestNormal.copy(hit.normal);
        this.guidedBestDirection.subVectors(hit.position, this.surfacePoint).normalize();
        return {
          position: this.guidedBestPosition,
          normal: this.guidedBestNormal,
          direction: this.guidedBestDirection,
          role: 'support',
        };
      }
    }
    return null;
  }

  tryRadioSupportDismount() {
    if (this.route?.id !== 'radio' || this.phase !== 'surface') return false;
    const routeConfig = POND_GAME.climbing.radio ?? {};
    const contact = this.findRadioSupportTransition({
      maximumDistance: Math.max(
        0.22,
        Number(routeConfig.spaceSupportTransitionMaximumDistance) || 0.72,
      ),
      outwardOffsets: [0.035, 0.07, 0.11, 0.16, 0.22, 0.3, 0.4, 0.52, 0.64],
      angleOffsetsDegrees: [0, 45, -45, 90, -90, 135, -135, 180],
    });
    if (!contact) {
      this.setPrompt(`Move toward an outside edge of the radio, then use the climb action again.`);
      return false;
    }

    const tangent = projectOntoPlane(contact.direction, contact.normal, new THREE.Vector3())
      ?? projectOntoPlane(this.surfaceTangent, contact.normal, new THREE.Vector3());
    if (!tangent) return false;
    const previousPoint = this.surfacePoint.clone();
    const previousNormal = this.surfaceNormal.clone();
    const previousTangent = this.surfaceTangent.clone();
    const previousRole = this.surfaceRole;
    this.surfacePoint.copy(contact.position);
    this.surfaceNormal.copy(contact.normal).normalize();
    this.surfaceTangent.copy(tangent).normalize();
    this.surfaceRole = 'support';
    if (!this.applySurfacePose(false)) {
      this.surfacePoint.copy(previousPoint);
      this.surfaceNormal.copy(previousNormal);
      this.surfaceTangent.copy(previousTangent);
      this.surfaceRole = previousRole;
      this.applySurfacePose(false);
      return false;
    }

    this.app.setAntAnimationPlaying(false);
    this.appendDebugTrail(this.surfacePose);
    this.updateDebugContact({
      position: this.surfacePoint,
      normal: this.surfaceNormal,
      tangent: this.surfaceTangent,
    });
    this.setPrompt(this.getSurfacePrompt());
    return true;
  }

  tryRadioModelTransfer() {
    if (!this.route || this.phase !== 'surface') return null;
    const currentRock = this.route.kind === 'rock' ? this.route.rock : null;
    if (this.route.id !== 'radio' && !currentRock) return null;

    const radioRoute = this.route.id === 'radio'
      ? this.route
      : this.getRouteCandidates(this.surfacePoint)
        .find((candidate) => candidate.id === 'radio');
    if (!radioRoute) return null;
    if (
      currentRock
      && !radioRoute.allowedRocks?.some((rock) => isSameRock(rock, currentRock))
    ) return null;

    const footprint = radioRoute.model?.groundFootprint;
    if (
      this.route.id === 'radio'
      && footprint?.containsGroundPoint?.(this.surfacePoint.x, this.surfacePoint.z, 0)
    ) return null;

    const modelSurface = radioRoute.surfaces?.find((surface) => surface.role === 'model');
    const bounds = radioRoute.bounds;
    if (!modelSurface?.object || !bounds) return null;

    const routeConfig = POND_GAME.climbing.radio ?? {};
    const maximumDistance = Math.max(
      0.12,
      Number(routeConfig.modelTransferMaximumDistance) || 0.38,
    );
    const minimumSurfaceNormalY = Number.isFinite(Number(routeConfig.minimumSurfaceNormalY))
      ? THREE.MathUtils.clamp(Number(routeConfig.minimumSurfaceNormalY), -1, 0.4)
      : -0.9;
    const boundsHeight = Math.max(0.01, bounds.max.y - bounds.min.y);
    const targetHeightFractions = [0.12, 0.28, 0.46, 0.68];
    let bestDistance = Infinity;
    let found = false;

    this.surfaceOrigin.copy(this.surfacePoint)
      .addScaledVector(this.surfaceNormal, 0.025);
    for (const heightFraction of targetHeightFractions) {
      this.surfaceCandidate.set(
        radioRoute.center.x,
        bounds.min.y + boundsHeight * heightFraction,
        radioRoute.center.z,
      );
      this.entryDirection.subVectors(this.surfaceCandidate, this.surfaceOrigin);
      if (this.entryDirection.lengthSq() < EPSILON) continue;
      this.entryDirection.normalize();
      let hit = this.raycastRouteSurface(
        this.surfaceOrigin,
        this.entryDirection,
        radioRoute,
        [modelSurface],
      );
      hit = this.validateExteriorContact(hit, radioRoute);
      if (!hit || !this.isSafeContact(hit, minimumSurfaceNormalY)) continue;
      const transferDistance = hit.position.distanceTo(this.surfacePoint);
      if (transferDistance > maximumDistance || transferDistance >= bestDistance) continue;
      bestDistance = transferDistance;
      this.guidedBestPosition.copy(hit.position);
      this.guidedBestNormal.copy(hit.normal);
      this.guidedBestDirection.copy(this.entryDirection);
      found = true;
    }
    if (!found) return null;

    const tangent = projectOntoPlane(UP, this.guidedBestNormal, new THREE.Vector3())
      ?? projectOntoPlane(this.guidedBestDirection, this.guidedBestNormal, new THREE.Vector3());
    if (!tangent) return null;

    const previousRoute = this.route;
    const previousPoint = this.surfacePoint.clone();
    const previousNormal = this.surfaceNormal.clone();
    const previousTangent = this.surfaceTangent.clone();
    const previousRole = this.surfaceRole;
    const groundEntry = previousRoute.entry?.clone();
    this.route = { ...radioRoute, entry: groundEntry ?? previousPoint.clone() };
    this.surfacePoint.copy(this.guidedBestPosition);
    this.surfaceNormal.copy(this.guidedBestNormal).normalize();
    this.surfaceTangent.copy(tangent).normalize();
    this.surfaceRole = 'model';
    if (!this.applySurfacePose(false)) {
      this.route = previousRoute;
      this.surfacePoint.copy(previousPoint);
      this.surfaceNormal.copy(previousNormal);
      this.surfaceTangent.copy(previousTangent);
      this.surfaceRole = previousRole;
      this.applySurfacePose(false);
      return null;
    }

    this.app.setAntAnimationPlaying(false);
    this.resetDebugTrail();
    this.appendDebugTrail(this.surfacePose);
    this.updateDebugContact({
      position: this.surfacePoint,
      normal: this.surfaceNormal,
      tangent: this.surfaceTangent,
    });
    this.setPrompt(this.getSurfacePrompt());
    return true;
  }

  findGuidedTentContact(direction, distance) {
    const routeConfig = POND_GAME.climbing[this.route?.configId ?? this.route?.id] ?? {};
    if (this.route?.id !== 'tent' || routeConfig.steerAroundOpenings !== true) return null;
    const angleOffsets = [-15, 15, -30, 30, -45, 45, -60, 60, -75, 75];
    for (const angleOffset of angleOffsets) {
      this.guidedDirection.copy(direction).applyAxisAngle(
        this.surfaceNormal,
        THREE.MathUtils.degToRad(angleOffset),
      );
      if (this.guidedDirection.y < -0.15) continue;
      this.surfaceCandidate.copy(this.surfacePoint)
        .addScaledVector(this.guidedDirection, distance);
      const contact = this.findAdjacentContact(
        this.surfaceCandidate,
        this.guidedDirection,
        distance,
      );
      if (!contact || contact.position.y < this.surfacePoint.y - 0.015) continue;
      this.guidedBestPosition.copy(contact.position);
      this.guidedBestNormal.copy(contact.normal);
      this.guidedBestDirection.copy(this.guidedDirection);
      return {
        position: this.guidedBestPosition,
        normal: this.guidedBestNormal,
        direction: this.guidedBestDirection,
      };
    }
    return null;
  }

  findAdjacentContact(candidate, direction, distance) {
    const rockConfig = POND_GAME.climbing.rock ?? {};
    const isRockRoute = this.route?.kind === 'rock';
    const routeConfig = isRockRoute
      ? rockConfig
      : (POND_GAME.climbing[this.route?.configId ?? this.route?.id] ?? {});
    const probeDistance = Math.max(
      0.04,
      Number(routeConfig.surfaceProbeDistance)
        || Number(POND_GAME.climbing.surfaceProbeDistance)
        || 0.16,
    );
    const configuredSnapDistance = Math.max(
      probeDistance,
      Number(routeConfig.surfaceSnapDistance)
        || Number(POND_GAME.climbing.surfaceSnapDistance)
        || 0.22,
    );
    const usesSharpTransitions = isRockRoute
      || Number.isFinite(Number(routeConfig.minimumNormalContinuity));
    const minimumNormalContinuity = usesSharpTransitions
      ? Math.max(
        -0.9,
        Math.min(0.25, Number(routeConfig.minimumNormalContinuity) || -0.55),
      )
      : -0.25;
    const minimumSurfaceNormalY = Number.isFinite(Number(routeConfig.minimumSurfaceNormalY))
      ? THREE.MathUtils.clamp(Number(routeConfig.minimumSurfaceNormalY), -1, 0.4)
      : -0.25;
    const maximumContactStepDistance = Math.max(
      distance * 1.5,
      Number(routeConfig.maximumContactStepDistance)
        || configuredSnapDistance + distance,
    );
    const attempts = [
      {
        origin: candidate.clone().addScaledVector(this.surfaceNormal, probeDistance),
        direction: this.surfaceNormal.clone().negate(),
      },
      {
        origin: candidate.clone()
          .addScaledVector(this.surfaceNormal, probeDistance)
          .addScaledVector(direction, probeDistance),
        direction: this.surfaceNormal.clone().add(direction).negate().normalize(),
      },
    ];
    if (this.surfaceNormal.y > -0.2) {
      attempts.push({
        origin: candidate.clone().addScaledVector(UP, probeDistance * 2),
        direction: DOWN,
      });
    }
    if (
      routeConfig.preferRouteCenterOnLedges === true
      && (
        !this.route?.bounds
        || this.surfacePoint.y <= this.route.bounds.min.y
          + (this.route.bounds.max.y - this.route.bounds.min.y)
            * THREE.MathUtils.clamp(
              Number(routeConfig.routeCenterLedgeMaximumHeightFraction) || 1,
              0.05,
              1,
            )
      )
      && this.surfaceNormal.y >= (
        Number(routeConfig.ledgeNormalYThreshold) || 0.62
      )
    ) {
      const centerDirection = this.surfaceDelta
        .subVectors(this.route.center, candidate)
        .setY(0);
      if (centerDirection.lengthSq() > EPSILON) {
        centerDirection.normalize();
        attempts.push({
          origin: candidate.clone()
            .addScaledVector(this.surfaceNormal, probeDistance * 0.24)
            .addScaledVector(centerDirection, -probeDistance * 0.65),
          direction: centerDirection.clone(),
        });
      }
    }
    const forwardDownMinimumNormalY = Number.isFinite(
      Number(routeConfig.forwardDownMinimumNormalY),
    )
      ? THREE.MathUtils.clamp(Number(routeConfig.forwardDownMinimumNormalY), -0.95, 0.95)
      : -0.95;
    if (
      (isRockRoute || routeConfig.useForwardDownProbe === true)
      && this.surfaceNormal.y >= forwardDownMinimumNormalY
    ) {
      attempts.push({
        origin: candidate.clone()
          .addScaledVector(direction, probeDistance * 0.75)
          .addScaledVector(UP, probeDistance * 2.5),
        direction: DOWN,
      });
    }

    let bestScore = Infinity;
    let found = false;
    this.surfaceBestRole = null;
    for (const attempt of attempts) {
      let hit = this.raycastRouteSurface(attempt.origin, attempt.direction);
      hit = this.validateExteriorContact(hit);
      if (this.isHiddenCompositeContact(hit)) continue;
      if (!hit || !this.isSafeContact(hit, minimumSurfaceNormalY)) continue;
      if (this.isInsideNeighborRock(hit.position)) continue;
      const snapDistance = hit.position.distanceTo(candidate);
      if (snapDistance > configuredSnapDistance) continue;
      if (hit.normal.dot(this.surfaceNormal) < minimumNormalContinuity) continue;
      const advance = this.surfaceDelta.subVectors(hit.position, this.surfacePoint).dot(direction);
      if (advance < distance * 0.05) continue;
      if (hit.position.distanceTo(this.surfacePoint) > maximumContactStepDistance) continue;
      const score = snapDistance + (1 - hit.normal.dot(this.surfaceNormal)) * 0.03;
      if (score >= bestScore) continue;
      bestScore = score;
      this.surfaceBestPosition.copy(hit.position);
      this.surfaceBestNormal.copy(hit.normal);
      this.surfaceBestRole = this.getSurfaceRole(hit);
      found = true;
    }
    if (!found) return null;
    return {
      position: this.surfaceBestPosition,
      normal: this.surfaceBestNormal,
      role: this.surfaceBestRole,
    };
  }

  applySurfacePose(moving) {
    this.surfacePose.copy(this.surfacePoint).addScaledVector(
      this.surfaceNormal,
      POND_GAME.climbing.surfaceLift,
    );
    const horizontalTangent = this.surfaceTangent.clone().setY(0);
    if (horizontalTangent.lengthSq() > EPSILON) {
      horizontalTangent.normalize();
      this.lastHeading = Math.atan2(horizontalTangent.x, horizontalTangent.z);
    }
    return this.app.setAntSurfacePose(this.surfacePose, {
      normal: this.surfaceNormal,
      tangent: this.surfaceTangent,
      moving,
    });
  }

  getActivationDistance(route = this.nearbyRoute ?? this.route) {
    const routeConfig = POND_GAME.climbing[route?.configId ?? route?.id] ?? {};
    return Math.max(
      0.04,
      Number(routeConfig.activationDistance)
        || Number(POND_GAME.climbing.activationDistance)
        || 0.16,
    );
  }

  refreshNearbyRoute({ exhaustive = false } = {}) {
    this.detectionElapsed = 0;
    const antPosition = this.app.getAntWorldPosition(this.antPosition);
    if (!antPosition) return null;
    const headPosition = this.getAntHeadPosition(this.antHeadPosition);
    if (!headPosition) return null;
    this.debugValidSegments.length = 0;
    this.debugRejectedSegments.length = 0;
    const candidates = this.getRouteCandidates(antPosition)
      .sort((left, right) => this.compareRouteCandidates(left, right, headPosition));
    const passiveRouteLimit = Math.max(
      1,
      Math.round(Number(POND_GAME.climbing.passiveRouteLimit) || 1),
    );
    const routeLimit = exhaustive ? candidates.length : passiveRouteLimit;
    const passiveProbeLimit = Math.max(
      1,
      Math.round(Number(POND_GAME.climbing.passiveEntryProbeLimit) || 3),
    );
    this.nearbyRoute = null;
    this.nearbyContact = null;
    for (let index = 0; index < Math.min(routeLimit, candidates.length); index += 1) {
      const route = candidates[index];
      const routeConfig = POND_GAME.climbing[route.configId ?? route.id] ?? {};
      const configuredMaximum = Number(routeConfig.maximumEntryProbes);
      const availableProbeCount = this.getEntryProbeCount(route);
      const maximumProbes = exhaustive
        ? (Number.isFinite(configuredMaximum) ? Math.max(1, configuredMaximum) : Infinity)
        : Math.min(
          passiveProbeLimit,
          Number.isFinite(configuredMaximum) ? Math.max(1, configuredMaximum) : Infinity,
        );
      const passiveProbeSpan = Math.max(
        1,
        Math.min(
          availableProbeCount,
          Number.isFinite(configuredMaximum) ? Math.max(1, configuredMaximum) : Infinity,
        ),
      );
      const probeOffset = exhaustive
        ? 0
        : (this.passiveProbeCursorByRoute.get(route.id) ?? 0) % passiveProbeSpan;
      const contact = this.findEntryContact(route, headPosition, {
        maximumProbes,
        probeOffset,
      });
      if (!exhaustive) {
        this.passiveProbeCursorByRoute.set(
          route.id,
          contact ? probeOffset : (probeOffset + maximumProbes) % passiveProbeSpan,
        );
      }
      if (
        !contact
        || contact.position.distanceTo(headPosition) > this.getActivationDistance(route)
      ) continue;
      this.nearbyRoute = route;
      this.nearbyContact = contact;
      break;
    }
    this.updateDebugProbeLines();
    this.updateDebugContact(this.nearbyContact);
    this.setGameplayContactMarker(this.nearbyContact);
    if (this.nearbyRoute) {
      this.setPrompt(`Head near ${this.nearbyRoute.label}, then use the climb action.`);
    } else {
      this.setPrompt('');
    }
    return this.nearbyRoute;
  }

  getEntryProbeCount(route) {
    const routeConfig = POND_GAME.climbing[route?.configId ?? route?.id] ?? {};
    const directionCount = Array.isArray(routeConfig.entryDirectionAngleOffsetsDegrees)
      ? Math.max(1, routeConfig.entryDirectionAngleOffsetsDegrees.length)
      : 1;
    const heightCount = Array.isArray(routeConfig.entryHeightFactors)
      ? Math.max(1, routeConfig.entryHeightFactors.length)
      : ENTRY_HEIGHT_FACTORS.length;
    return directionCount * heightCount * ENTRY_LATERAL_FACTORS.length;
  }

  getRouteBoundaryDistance(route, position) {
    let boundaryDistance;
    if (route?.kind === 'model' && route.bounds) {
      const deltaX = Math.max(
        route.bounds.min.x - position.x,
        0,
        position.x - route.bounds.max.x,
      );
      const deltaZ = Math.max(
        route.bounds.min.z - position.z,
        0,
        position.z - route.bounds.max.z,
      );
      boundaryDistance = Math.hypot(deltaX, deltaZ);
    } else {
      boundaryDistance = Math.max(
        0,
        horizontalDistance(position, route.center) - route.entryRadius,
      );
    }
    return Math.max(0, boundaryDistance - this.getActivationDistance(route));
  }

  compareRouteCandidates(left, right, position) {
    const leftIsRadioSupport = left?.id === 'radio'
      && right?.kind === 'rock'
      && left.allowedRocks?.some((rock) => isSameRock(rock, right.rock));
    const rightIsRadioSupport = right?.id === 'radio'
      && left?.kind === 'rock'
      && right.allowedRocks?.some((rock) => isSameRock(rock, left.rock));
    if (leftIsRadioSupport !== rightIsRadioSupport) {
      return leftIsRadioSupport ? -1 : 1;
    }
    const leftDistance = this.getRouteBoundaryDistance(left, position);
    const rightDistance = this.getRouteBoundaryDistance(right, position);
    const distanceDifference = leftDistance - rightDistance;
    if (Math.abs(distanceDifference) > 0.06) return distanceDifference;
    const priorityDifference = (right.priority ?? 0) - (left.priority ?? 0);
    return priorityDifference || distanceDifference;
  }

  getRouteCandidates(antPosition) {
    const landmarks = this.landmarks;
    if (!landmarks || POND_GAME.climbing.enabled === false) return [];
    const enabled = POND_GAME.climbing.objects ?? {};
    const candidates = [];

    if (enabled.tree !== false) {
      const treeConfig = POND_GAME.climbing.tree;
      const trees = landmarks.trees?.length
        ? landmarks.trees
        : [landmarks.tree].filter(Boolean);
      trees.forEach((tree, index) => {
        if (!tree.surfaceObject) return;
        this.addCandidate(candidates, {
          id: index === 0 ? 'tree' : `tree-${index}`,
          configId: 'tree',
          label: index === 0 ? 'the ash tree' : 'a companion tree',
          kind: 'tree',
          center: tree.position,
          entryRadius: Math.max(
            treeConfig.entryRadius,
            tree.baseRadius + 0.18,
          ),
          containsEntryPoint: tree.groundFootprint?.containsGroundPoint,
          surfaceObject: tree.surfaceObject,
          surfaces: [{ object: tree.surfaceObject, instanceId: null }],
          bounds: tree.bounds,
          tree,
          priority: 1,
        }, antPosition);
      });
    }

    for (const rock of landmarks.rocks ?? []) {
      const sourceEnabled = rock.source === 'shoreline'
        ? enabled.shorelineRocks !== false
        : enabled.groundRocks !== false;
      if (!sourceEnabled || rock.usableRadius < POND_GAME.climbing.rock.minimumUsableRadius) continue;
      this.addCandidate(candidates, {
        id: rock.id ?? `rock-${rock.source}-${rock.rockIndex}`,
        label: rock.label ?? 'a rock',
        kind: 'rock',
        center: rock.basePosition ?? rock.position,
        entryRadius: rock.usableRadius + POND_GAME.climbing.rock.entryPadding,
        surfaceObject: rock.surfaceObject,
        instanceId: Number.isInteger(rock.rockIndex) ? rock.rockIndex : null,
        surfaces: [{
          object: rock.surfaceObject,
          instanceId: Number.isInteger(rock.rockIndex) ? rock.rockIndex : null,
        }],
        allowedRocks: [rock],
        rock,
        priority: 0,
      }, antPosition);
    }

    if (enabled.reader !== false && landmarks.reader?.surfaceObject) {
      const readerConfig = POND_GAME.climbing.reader;
      this.addModelCandidate(candidates, 'reader', 'the seated person', landmarks.reader, {
        entryRadius: Math.max(
          readerConfig.entryRadius,
          Math.max(landmarks.reader.size.x, landmarks.reader.size.z)
            * readerConfig.entryBoundsScale,
        ),
        priority: 2,
      }, antPosition);
    }
    if (enabled.radio !== false && landmarks.radio?.surfaceObject) {
      const radioConfig = POND_GAME.climbing.radio;
      const radioCenter = centerOfBounds(landmarks.radio.bounds, new THREE.Vector3());
      const radioEntryRadius = Math.max(landmarks.radio.size.x, landmarks.radio.size.z)
        * radioConfig.entryBoundsScale + radioConfig.entryPadding;
      const support = [landmarks.radio.supportRock, ...(landmarks.rocks ?? [])]
        .filter((rock, index, rocks) => (
          rock?.surfaceObject
          && rocks.indexOf(rock) === index
          && horizontalDistance(rock.basePosition ?? rock.position, radioCenter)
            <= radioEntryRadius + rock.usableRadius + 0.12
        ))
        .sort((left, right) => (
          horizontalDistance(left.basePosition ?? left.position, radioCenter)
          - horizontalDistance(right.basePosition ?? right.position, radioCenter)
        ))[0] ?? null;
      this.addModelCandidate(candidates, 'radio', 'the radio', landmarks.radio, {
        center: radioCenter,
        entryRadius: radioEntryRadius,
        surfaces: [
          ...(support ? [{
            object: support.surfaceObject,
            instanceId: Number.isInteger(support.rockIndex) ? support.rockIndex : null,
            role: 'support',
          }] : []),
          { object: landmarks.radio.surfaceObject, instanceId: null, role: 'model' },
        ],
        allowedRocks: support ? [support] : [],
        priority: 3,
      }, antPosition);
    }
    if (enabled.streetLamp !== false && landmarks.streetLamp?.surfaceObject) {
      const lampConfig = POND_GAME.climbing.streetLamp;
      this.addModelCandidate(candidates, 'streetLamp', 'the corner lamp', landmarks.streetLamp, {
        entryRadius: Math.max(landmarks.streetLamp.size.x, landmarks.streetLamp.size.z)
          * lampConfig.entryBoundsScale + lampConfig.entryPadding,
        priority: 2,
      }, antPosition);
    }
    if (enabled.tent !== false && landmarks.tent?.surfaceObject) {
      this.addModelCandidate(candidates, 'tent', 'the tent', landmarks.tent, {
        entryRadius: Math.max(landmarks.tent.size.x, landmarks.tent.size.z) * 0.5
          + POND_GAME.climbing.tent.entryPadding,
        priority: 2,
      }, antPosition);
    }
    return candidates;
  }

  addModelCandidate(candidates, id, label, model, options, antPosition) {
    this.addCandidate(candidates, {
      id,
      label,
      kind: 'model',
      center: options.center ?? centerOfBounds(model.bounds, new THREE.Vector3()),
      entryRadius: options.entryRadius,
      surfaceObject: model.surfaceObject,
      surfaces: options.surfaces ?? [{ object: model.surfaceObject, instanceId: null }],
      containsEntryPoint: model.groundFootprint?.containsGroundPoint,
      allowedRocks: options.allowedRocks ?? [],
      bounds: model.bounds,
      model,
      groundFootprint: model.groundFootprint ?? null,
      priority: options.priority ?? 0,
    }, antPosition);
  }

  addCandidate(candidates, candidate, antPosition) {
    const activationDistance = this.getActivationDistance(candidate);
    const headOffset = Math.max(0, Number(POND_GAME.climbing.headOffset) || 0.045);
    const footprintPadding = activationDistance + headOffset
      + Math.max(
        0.08,
        Number(POND_GAME.climbing[candidate.configId ?? candidate.id]?.maximumEntryCutDistance)
          || Number(POND_GAME.climbing.maximumEntryCutDistance)
          || 0.22,
      );
    const nearEntryFootprint = candidate.containsEntryPoint?.(
      antPosition.x,
      antPosition.z,
      footprintPadding,
    ) ?? false;
    if (
      !candidate.center
      || !candidate.surfaceObject
      || !Number.isFinite(candidate.entryRadius)
      || (
        !nearEntryFootprint
        && horizontalDistance(antPosition, candidate.center)
          > candidate.entryRadius + activationDistance + headOffset
      )
    ) return;
    candidates.push(candidate);
  }

  getAntHeadPosition(target = new THREE.Vector3()) {
    const antPosition = this.app.getAntWorldPosition(target);
    const facing = this.app.getAntFacingDirection(this.antFacing);
    if (!antPosition || !facing) return null;
    return target.addScaledVector(
      facing,
      Math.max(0, Number(POND_GAME.climbing.headOffset) || 0.045),
    );
  }

  findEntryContact(
    route,
    headPosition = this.getAntHeadPosition(this.antHeadPosition),
    { maximumProbes = Infinity, probeOffset = 0 } = {},
  ) {
    if (!headPosition) return null;
    this.entryBaseDirection.subVectors(route.center, headPosition).setY(0);
    if (this.entryBaseDirection.lengthSq() < EPSILON) return null;
    this.entryBaseDirection.normalize();
    const routeConfig = POND_GAME.climbing[route.configId ?? route.id] ?? {};
    const directionAngleOffsets = Array.isArray(routeConfig.entryDirectionAngleOffsetsDegrees)
      ? routeConfig.entryDirectionAngleOffsetsDegrees
      : [0];
    const entryHeightFactors = Array.isArray(routeConfig.entryHeightFactors)
      ? routeConfig.entryHeightFactors
      : ENTRY_HEIGHT_FACTORS;
    const maximumHeight = Math.max(
      0.06,
      Number(POND_GAME.climbing[route.configId ?? route.id]?.maximumEntryHeight)
        || Number(POND_GAME.climbing.maximumEntryHeight)
        || 0.2,
    );
    const maximumCutDistance = Math.max(
      0.08,
      Number(POND_GAME.climbing[route.configId ?? route.id]?.maximumEntryCutDistance)
        || Number(POND_GAME.climbing.maximumEntryCutDistance)
        || 0.3,
    );
    const lateralRange = Math.min(0.24, Math.max(0.08, route.entryRadius * 0.28));
    const minimumEntryNormalY = Number.isFinite(Number(routeConfig.minimumEntryNormalY))
      ? Math.max(-0.95, Math.min(0.4, Number(routeConfig.minimumEntryNormalY)))
      : -0.25;
    const probeLimit = Number.isFinite(Number(maximumProbes))
      ? Math.max(1, Math.floor(Number(maximumProbes)))
      : Infinity;
    const skippedProbeCount = Math.max(0, Math.floor(Number(probeOffset) || 0));
    let traversedProbeCount = 0;
    let probeCount = 0;
    let best = null;
    let bestScore = Infinity;
    entryProbeSearch:
    for (const angleOffsetDegrees of directionAngleOffsets) {
      const angleOffset = THREE.MathUtils.degToRad(Number(angleOffsetDegrees) || 0);
      const cosine = Math.cos(angleOffset);
      const sine = Math.sin(angleOffset);
      this.entryDirection.set(
        this.entryBaseDirection.x * cosine - this.entryBaseDirection.z * sine,
        0,
        this.entryBaseDirection.x * sine + this.entryBaseDirection.z * cosine,
      ).normalize();
      this.surfaceRight.set(-this.entryDirection.z, 0, this.entryDirection.x);
      for (const heightFactor of entryHeightFactors) {
        for (const lateralFactor of ENTRY_LATERAL_FACTORS) {
          const x = headPosition.x + this.surfaceRight.x * lateralRange * lateralFactor;
          const z = headPosition.z + this.surfaceRight.z * lateralRange * lateralFactor;
          const ground = this.app.getAntGroundPosition(x, z, this.groundPoint);
          if (!ground) continue;
          if (traversedProbeCount < skippedProbeCount) {
            traversedProbeCount += 1;
            continue;
          }
          if (probeCount >= probeLimit) break entryProbeSearch;
          probeCount += 1;
          this.surfaceOrigin.set(x, ground.y + maximumHeight * heightFactor, z)
            .addScaledVector(this.entryDirection, -maximumCutDistance);
          let hit = this.raycastRouteSurface(this.surfaceOrigin, this.entryDirection, route);
          if (!hit) {
            this.recordDebugProbe(
              this.surfaceOrigin,
              this.surfaceOrigin.clone().addScaledVector(
                this.entryDirection,
                maximumCutDistance * 2,
              ),
              false,
            );
            continue;
          }
          hit = this.validateExteriorContact(hit, route);
          if (!hit) {
            this.recordDebugProbe(
              this.surfaceOrigin,
              this.surfaceOrigin.clone().addScaledVector(
                this.entryDirection,
                maximumCutDistance * 2,
              ),
              false,
            );
            continue;
          }
          if (this.isHiddenCompositeContact(hit, route)) {
            this.recordDebugProbe(this.surfaceOrigin, hit.position, false);
            continue;
          }
          if (!this.isSafeContact(hit, minimumEntryNormalY)) {
            this.recordDebugProbe(this.surfaceOrigin, hit.position, false);
            continue;
          }
          if (this.isInsideNeighborRock(hit.position, route)) {
            this.recordDebugProbe(this.surfaceOrigin, hit.position, false);
            continue;
          }
          const cutDistance = hit.position.distanceTo(headPosition);
          if (cutDistance > maximumCutDistance) {
            this.recordDebugProbe(this.surfaceOrigin, hit.position, false);
            continue;
          }
          const tangent = projectOntoPlane(UP, hit.normal, new THREE.Vector3())
            ?? projectOntoPlane(this.entryDirection, hit.normal, new THREE.Vector3());
          if (!tangent) {
            this.recordDebugProbe(this.surfaceOrigin, hit.position, false);
            continue;
          }
          this.recordDebugProbe(this.surfaceOrigin, hit.position, true);
          const contact = {
            position: hit.position.clone(),
            normal: hit.normal.clone(),
            tangent,
            role: this.getSurfaceRole(hit, route),
          };
          if (routeConfig.returnFirstValidEntryContact === true) return contact;
          const heightAboveGround = Math.max(0, hit.position.y - ground.y);
          const score = cutDistance
            + heightAboveGround * 0.2
            + Math.abs(lateralFactor) * 0.015
            + Math.abs(angleOffset) * 0.008;
          if (score >= bestScore) continue;
          bestScore = score;
          best = contact;
        }
      }
    }
    return best;
  }

  raycastRouteSurface(origin, direction, route = this.route, surfaceOverride = null) {
    const surfaces = surfaceOverride ?? route?.surfaces ?? (route?.surfaceObject ? [{
      object: route.surfaceObject,
      instanceId: route.instanceId ?? null,
    }] : []);
    let bestDistance = Infinity;
    let bestObject = null;
    let bestInstanceId = null;
    for (const surface of surfaces) {
      if (!surface?.object) continue;
      const hit = this.app.raycastSurface(surface.object, origin, direction, {
        instanceId: surface.instanceId ?? null,
        targetPosition: this.surfaceHitPosition,
        targetNormal: this.surfaceHitNormal,
      });
      if (!hit) continue;
      const distance = hit.position.distanceTo(origin);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      this.raycastBestPosition.copy(hit.position);
      this.raycastBestNormal.copy(hit.normal);
      bestObject = hit.object;
      bestInstanceId = hit.instanceId;
    }
    return bestObject ? {
      position: this.raycastBestPosition,
      normal: this.raycastBestNormal,
      object: bestObject,
      instanceId: bestInstanceId,
    } : null;
  }

  getSurfaceRole(hit, route = this.route) {
    if (!hit?.object || !route?.surfaces) return null;
    return route.surfaces.find((surface) => (
      belongsToSurfaceObject(hit.object, surface.object)
      && (
        surface.instanceId === null
        || surface.instanceId === undefined
        || surface.instanceId === hit.instanceId
      )
    ))?.role ?? null;
  }

  validateExteriorContact(hit, route = this.route) {
    if (!hit?.position || !route) return null;
    const routeConfig = POND_GAME.climbing[route.configId ?? route.id] ?? {};
    if (routeConfig.validateExteriorContacts !== true || !route.bounds) return hit;

    this.exteriorCandidatePosition.copy(hit.position);
    this.exteriorCandidateNormal.copy(hit.normal);
    this.exteriorDirection.copy(hit.normal);
    if (this.exteriorDirection.lengthSq() < 0.0004) {
      this.exteriorDirection.subVectors(hit.position, route.center);
    }
    if (this.exteriorDirection.lengthSq() < 0.0004) return hit;
    this.exteriorDirection.normalize();

    const sourceSurface = route.surfaces?.find((surface) => (
      belongsToSurfaceObject(hit.object, surface.object)
      && (
        surface.instanceId === null
        || surface.instanceId === undefined
        || surface.instanceId === hit.instanceId
      )
    ));

    const validationBounds = sourceSurface?.bounds ?? route.bounds;
    const boundsWidth = validationBounds.max.x - validationBounds.min.x;
    const boundsHeight = validationBounds.max.y - validationBounds.min.y;
    const boundsDepth = validationBounds.max.z - validationBounds.min.z;
    const castOffset = Math.hypot(boundsWidth, boundsHeight, boundsDepth) + 0.5;
    this.exteriorOrigin.copy(hit.position)
      .addScaledVector(this.exteriorDirection, castOffset);
    const exteriorHit = this.raycastRouteSurface(
      this.exteriorOrigin,
      this.exteriorRayDirection.copy(this.exteriorDirection).negate(),
      route,
      sourceSurface ? [sourceSurface] : null,
    );
    if (!exteriorHit) return null;

    const correctionDistance = exteriorHit.position.distanceTo(this.exteriorCandidatePosition);
    const tolerance = Math.max(
      0.008,
      Number(routeConfig.exteriorContactTolerance) || 0.03,
    );
    const maximumCorrection = Math.max(
      tolerance,
      Number(routeConfig.maximumExteriorCorrectionDistance) || tolerance,
    );
    if (correctionDistance > maximumCorrection) return null;
    this.exteriorBestPosition.copy(exteriorHit.position);
    this.exteriorBestNormal.copy(exteriorHit.normal);
    return {
      position: this.exteriorBestPosition,
      normal: this.exteriorBestNormal,
      object: exteriorHit.object,
      instanceId: exteriorHit.instanceId,
      corrected: correctionDistance > tolerance,
    };
  }

  isHiddenCompositeContact(hit, route = this.route) {
    if (!hit?.position || !route) return false;
    const isRadioRoute = route.id === 'radio';
    const radioLandmark = this.landmarks?.radio;
    const isRadioSupportRockRoute = route.kind === 'rock'
      && isSameRock(route.rock, radioLandmark?.supportRock);
    if (!isRadioRoute && !isRadioSupportRockRoute) return false;
    const supportSurface = isRadioRoute
      ? route.surfaces?.find((surface) => surface.role === 'support')
      : {
        object: route.surfaceObject,
        instanceId: route.instanceId ?? null,
      };
    if (
      !supportSurface?.object
      || !belongsToSurfaceObject(hit.object, supportSurface.object)
      || (
        supportSurface.instanceId !== null
        && supportSurface.instanceId !== undefined
        && supportSurface.instanceId !== hit.instanceId
      )
    ) return false;
    const footprint = isRadioRoute
      ? route.model?.groundFootprint
      : radioLandmark?.groundFootprint;
    return footprint?.containsGroundPoint?.(
      hit.position.x,
      hit.position.z,
      0.012,
    ) ?? false;
  }

  isSafeContact(hit, minimumNormalY = -0.25) {
    if (
      !hit?.position
      || !hit?.normal
      || hit.normal.lengthSq() < EPSILON
      || hit.normal.y < minimumNormalY
    ) return false;
    const ground = this.app.getAntGroundPosition?.(
      hit.position.x,
      hit.position.z,
      this.groundPoint,
    );
    return !ground || hit.position.y + 0.008 >= ground.y;
  }

  isInsideNeighborRock(position, route = this.route) {
    if (!position || !this.landmarks?.rocks?.length) return false;
    const allowedRocks = route?.allowedRocks ?? [];
    const padding = Math.max(
      0,
      Number(POND_GAME.climbing.neighborRockPadding) || 0.04,
    );
    return this.landmarks.rocks.some((rock) => {
      if (
        allowedRocks.includes(rock)
        || !containsFootprint(rock.footprint, position.x, position.z, padding)
      ) return false;
      if (rock.surfaceObject) {
        const topY = Number(rock.position?.y);
        this.neighborSurfaceOrigin.set(
          position.x,
          Math.max(position.y + 0.2, Number.isFinite(topY) ? topY + 0.12 : position.y + 0.4),
          position.z,
        );
        const hit = this.app.raycastSurface(rock.surfaceObject, this.neighborSurfaceOrigin, DOWN, {
          instanceId: Number.isInteger(rock.rockIndex) ? rock.rockIndex : null,
          targetPosition: this.neighborSurfacePosition,
          targetNormal: this.neighborSurfaceNormal,
        });
        return Boolean(
          hit
          && hit.position.y > position.y
            + Math.max(0.008, Number(POND_GAME.climbing.surfaceLift) || 0.012),
        );
      }
      const baseY = Number(rock.basePosition?.y);
      const topY = Number(rock.position?.y);
      if (!Number.isFinite(baseY) || !Number.isFinite(topY)) return true;
      const lowBlockingHeight = Math.min(
        0.08,
        Math.max(0.025, (topY - baseY) * 0.42),
      );
      return position.y <= baseY + lowBlockingHeight;
    });
  }

  findDismountPosition() {
    if (!this.route) return null;
    this.surfaceMove.subVectors(this.surfacePoint, this.route.center).setY(0);
    if (this.surfaceMove.lengthSq() < EPSILON) {
      this.surfaceMove.copy(this.surfaceNormal).setY(0);
    }
    if (this.surfaceMove.lengthSq() < EPSILON) {
      this.surfaceMove.copy(this.surfaceTangent).setY(0);
    }
    if (this.surfaceMove.lengthSq() < EPSILON) this.surfaceMove.set(0, 0, 1);
    this.surfaceMove.normalize();
    const preferredAngle = Math.atan2(this.surfaceMove.x, this.surfaceMove.z);
    const angleOffsets = [
      0,
      Math.PI * 0.125,
      -Math.PI * 0.125,
      Math.PI * 0.25,
      -Math.PI * 0.25,
      Math.PI * 0.5,
      -Math.PI * 0.5,
      Math.PI,
    ];
    const maximumDistance = Math.max(1.2, this.route.entryRadius + 0.6);
    for (let distance = 0.06; distance <= maximumDistance; distance += 0.06) {
      for (const angleOffset of angleOffsets) {
        const angle = preferredAngle + angleOffset;
        const x = this.surfacePoint.x + Math.sin(angle) * distance;
        const z = this.surfacePoint.z + Math.cos(angle) * distance;
        if (!this.app.canAntOccupy(x, z)) continue;
        const landing = this.app.getAntGroundPosition(x, z, new THREE.Vector3());
        if (landing) return landing;
      }
    }
    return this.route.entry?.clone() ?? null;
  }

  finishRoute(landing) {
    this.clearMovementInput();
    this.app.clearAntMovement();
    this.route = null;
    this.phase = 'ground';
    this.surfaceRole = null;
    this.app.setAntMotionLocked(false);
    this.app.setAntPose(landing, { heading: this.lastHeading, moving: false });
    this.app.setAntAnimationPlaying(false);
    this.resetDebugTrail();
    this.refreshNearbyRoute();
  }

  dismount() {
    if (!this.route || this.phase !== 'surface' || !this.route.entry) return false;
    const landing = this.findDismountPosition();
    if (!landing) return false;
    this.finishRoute(landing);
    return true;
  }

  abortRoute(message) {
    const landing = this.route?.entry?.clone();
    this.route = null;
    this.phase = 'ground';
    this.surfaceRole = null;
    this.app.setAntMotionLocked(false);
    if (landing) this.app.setAntPose(landing, { heading: this.lastHeading, moving: false });
    this.app.setAntAnimationPlaying(false);
    this.clearMovementInput();
    this.app.clearAntMovement();
    this.setPrompt(message);
  }

  isOnRadioSupportSurface() {
    if (this.route?.id === 'radio' && this.surfaceRole) {
      return this.surfaceRole === 'support';
    }
    const footprint = this.route?.id === 'radio'
      ? this.route.model?.groundFootprint
      : null;
    return Boolean(
      footprint?.containsGroundPoint
      && !footprint.containsGroundPoint(this.surfacePoint.x, this.surfacePoint.z, 0),
    );
  }

  getSurfacePrompt() {
    if (!this.route) return '';
    if (this.isOnRadioSupportSurface()) {
      return `On the rock below the radio. Use the climb action to climb onto it.`;
    }
    return `On ${this.route.label}. Move to roam, or use the climb action to get down.`;
  }

  setPrompt(prompt) {
    if (prompt === this.currentPrompt) return;
    this.currentPrompt = prompt;
    this.onPromptChange(prompt);
  }

  setupGameplayContactMarker() {
    const config = POND_GAME.climbing.contactMarker ?? {};
    if (
      this.gameplayContactMarker
      || config.enabled === false
      || !this.app.world
    ) return;
    const radius = Math.max(0.012, Number(config.radius) || 0.026);
    const geometry = new THREE.SphereGeometry(radius, 12, 8);
    const material = new THREE.MeshBasicMaterial({
      color: config.color ?? '#36d8ff',
      transparent: true,
      opacity: 0.94,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.gameplayContactMarker = new THREE.Mesh(geometry, material);
    this.gameplayContactMarker.name = 'Live climb contact marker';
    this.gameplayContactMarker.visible = false;
    this.gameplayContactMarker.frustumCulled = false;
    this.gameplayContactMarker.renderOrder = 60;
    this.app.addWorldObject(this.gameplayContactMarker);
  }

  setGameplayContactMarker(contact) {
    if (!this.gameplayContactMarker) return;
    if (!contact?.position) return;
    const wasVisible = this.gameplayContactMarker.visible;
    const visible = Boolean(
      contact?.position
      && this.phase === 'ground'
      && !this.exploreActive,
    );
    this.gameplayContactMarker.visible = visible;
    if (!visible) return;
    this.contactMarkerHoldRemaining = Math.max(
      0.1,
      Number(POND_GAME.climbing.contactMarker?.holdSeconds) || 0.65,
    );
    const normal = contact.normal?.lengthSq?.() > EPSILON ? contact.normal : UP;
    this.contactMarkerPosition.copy(contact.position).addScaledVector(
      normal,
      Math.max(
        0.004,
        Number(POND_GAME.climbing.contactMarker?.surfaceOffset) || 0.018,
      ),
    );
    const moved = this.gameplayContactMarker.position
      .distanceToSquared(this.contactMarkerPosition) > 0.000001;
    this.gameplayContactMarker.position.copy(this.contactMarkerPosition);
    if (!wasVisible || moved) {
      this.contactMarkerElapsed = 0;
      this.gameplayContactMarker.scale.setScalar(1);
    }
  }

  updateGameplayContactMarker(delta) {
    if (!this.gameplayContactMarker?.visible) return;
    const config = POND_GAME.climbing.contactMarker ?? {};
    const safeDelta = Math.max(0, Math.min(Number(delta) || 0, 0.05));
    this.contactMarkerElapsed += safeDelta;
    this.contactMarkerHoldRemaining = Math.max(
      0,
      this.contactMarkerHoldRemaining - safeDelta,
    );
    if (this.contactMarkerHoldRemaining <= 0) {
      this.gameplayContactMarker.visible = false;
      return;
    }
    const pulseAmount = THREE.MathUtils.clamp(
      Number(config.pulseAmount) || 0,
      0,
      0.4,
    );
    const pulseSpeed = Math.max(0, Number(config.pulseSpeed) || 0);
    const scale = 1 + Math.sin(this.contactMarkerElapsed * pulseSpeed * Math.PI * 2)
      * pulseAmount;
    this.gameplayContactMarker.scale.setScalar(scale);
  }

  clearGameplayContactMarker() {
    this.contactMarkerHoldRemaining = 0;
    if (this.gameplayContactMarker) this.gameplayContactMarker.visible = false;
  }

  disposeGameplayContactMarker() {
    if (!this.gameplayContactMarker) return;
    this.app.removeWorldObject(this.gameplayContactMarker);
    this.gameplayContactMarker.geometry?.dispose?.();
    this.gameplayContactMarker.material?.dispose?.();
    this.gameplayContactMarker = null;
  }

  setupDebugOverlay() {
    if (this.debugGroup || !this.app.world) return;
    const overlayMaterial = (color, opacity = 1) => new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
    const markerMaterial = (color) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    });
    const surfaceMaskMaterial = new THREE.MeshBasicMaterial({
      color: '#35f2a1',
      transparent: true,
      opacity: 0.2,
      wireframe: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'Ant climb debug overlay';
    this.debugGroup.renderOrder = 1000;
    this.debugHeadMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 10, 6),
      markerMaterial('#ffd54f'),
    );
    this.debugContactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 10, 6),
      markerMaterial('#36d8ff'),
    );
    const ringPoints = [];
    for (let index = 0; index < 48; index += 1) {
      const angle = index / 48 * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    }
    this.debugRangeRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(ringPoints),
      overlayMaterial('#ffd54f', 0.85),
    );
    const makeSegments = (color) => new THREE.LineSegments(
      new THREE.BufferGeometry(),
      overlayMaterial(color, 0.88),
    );
    this.debugValidProbes = makeSegments('#45ff78');
    this.debugRejectedProbes = makeSegments('#ff4d67');
    this.debugContactAxes = makeSegments('#c36bff');
    this.debugTrail = new THREE.Line(
      new THREE.BufferGeometry(),
      overlayMaterial('#36d8ff', 0.95),
    );
    this.debugSurfaceMask = this.createDebugSurfaceMask(surfaceMaskMaterial);
    this.debugGroup.add(
      this.debugSurfaceMask,
      this.debugRangeRing,
      this.debugHeadMarker,
      this.debugContactMarker,
      this.debugValidProbes,
      this.debugRejectedProbes,
      this.debugContactAxes,
      this.debugTrail,
    );
    this.debugGroup.traverse((object) => {
      object.renderOrder = 1000;
    });
    this.debugContactMarker.visible = false;
    this.debugGroup.visible = this.debugEnabled;
    this.app.addWorldObject(this.debugGroup);
    this.updateDebugAnchor();
  }

  createDebugSurfaceMask(material) {
    const mask = new THREE.Group();
    mask.name = 'Traversable climb surface mask';
    const enabled = POND_GAME.climbing.objects ?? {};
    const addMesh = (source, instanceId = null) => {
      if (!source?.isMesh) return;
      source.updateWorldMatrix(true, false);
      let overlay = null;
      if (source.isInstancedMesh && Number.isInteger(instanceId)) {
        overlay = new THREE.Mesh(source.geometry, material);
        source.getMatrixAt(instanceId, this.debugInstanceMatrix);
        overlay.matrix.multiplyMatrices(source.matrixWorld, this.debugInstanceMatrix);
      } else if (source.isInstancedMesh) {
        overlay = new THREE.InstancedMesh(source.geometry, material, source.count);
        overlay.instanceMatrix.copy(source.instanceMatrix);
        overlay.instanceMatrix.needsUpdate = true;
        overlay.matrix.copy(source.matrixWorld);
      } else {
        overlay = new THREE.Mesh(source.geometry, material);
        overlay.matrix.copy(source.matrixWorld);
      }
      overlay.matrixAutoUpdate = false;
      overlay.frustumCulled = false;
      overlay.renderOrder = 990;
      overlay.userData.climbDebugSharedGeometry = true;
      mask.add(overlay);
    };
    const addObject = (object) => {
      object?.traverse?.((child) => addMesh(child));
    };

    if (enabled.tree !== false) {
      const trees = this.landmarks?.trees?.length
        ? this.landmarks.trees
        : [this.landmarks?.tree].filter(Boolean);
      trees.forEach((tree) => addObject(tree.surfaceObject));
    }
    for (const rock of this.landmarks?.rocks ?? []) {
      const sourceEnabled = rock.source === 'shoreline'
        ? enabled.shorelineRocks !== false
        : enabled.groundRocks !== false;
      if (
        sourceEnabled
        && rock.usableRadius >= POND_GAME.climbing.rock.minimumUsableRadius
      ) addMesh(rock.surfaceObject, rock.rockIndex);
    }
    if (enabled.reader !== false) addObject(this.landmarks?.reader?.surfaceObject);
    if (enabled.radio !== false) addObject(this.landmarks?.radio?.surfaceObject);
    if (enabled.streetLamp !== false) addObject(this.landmarks?.streetLamp?.surfaceObject);
    if (enabled.tent !== false) addObject(this.landmarks?.tent?.surfaceObject);
    return mask;
  }

  toggleDebug() {
    if (POND_GAME.debug?.allowToggle !== true) return this.debugEnabled;
    this.debugEnabled = !this.debugEnabled;
    if (this.debugEnabled) this.setupDebugOverlay();
    if (this.debugGroup) this.debugGroup.visible = this.debugEnabled;
    return this.debugEnabled;
  }

  updateDebugAnchor() {
    if (!this.debugGroup) return;
    let head = null;
    if (this.phase === 'surface' && this.route) {
      head = this.antHeadPosition.copy(this.surfacePose).addScaledVector(
        this.surfaceTangent,
        Math.max(0, Number(POND_GAME.climbing.headOffset) || 0.045),
      );
    } else {
      head = this.getAntHeadPosition(this.antHeadPosition);
    }
    if (!head) return;
    this.debugHeadMarker.position.copy(head);
    this.debugRangeRing.position.copy(head);
    this.debugRangeRing.position.y += 0.004;
    const activationDistance = this.getActivationDistance();
    this.debugRangeRing.scale.setScalar(activationDistance);
  }

  recordDebugProbe(start, end, valid) {
    if (!this.debugGroup) return;
    const segments = valid ? this.debugValidSegments : this.debugRejectedSegments;
    segments.push(start.x, start.y, start.z, end.x, end.y, end.z);
  }

  updateDebugProbeLines() {
    this.setDebugPositions(this.debugValidProbes, this.debugValidSegments);
    this.setDebugPositions(this.debugRejectedProbes, this.debugRejectedSegments);
  }

  updateDebugContact(contact) {
    if (!this.debugContactMarker || !this.debugContactAxes) return;
    this.debugContactMarker.visible = Boolean(contact?.position);
    if (!contact?.position) {
      this.setDebugPositions(this.debugContactAxes, []);
      return;
    }
    this.debugContactMarker.position.copy(contact.position);
    const normal = contact.normal ?? UP;
    const tangent = contact.tangent ?? this.surfaceTangent;
    this.setDebugPositions(this.debugContactAxes, [
      contact.position.x,
      contact.position.y,
      contact.position.z,
      contact.position.x + normal.x * 0.12,
      contact.position.y + normal.y * 0.12,
      contact.position.z + normal.z * 0.12,
      contact.position.x,
      contact.position.y,
      contact.position.z,
      contact.position.x + tangent.x * 0.12,
      contact.position.y + tangent.y * 0.12,
      contact.position.z + tangent.z * 0.12,
    ]);
  }

  resetDebugTrail() {
    this.debugTrailPoints.length = 0;
    this.setDebugPositions(this.debugTrail, []);
  }

  appendDebugTrail(point) {
    if (!point || !this.debugTrail) return;
    const previousOffset = this.debugTrailPoints.length - 3;
    if (previousOffset >= 0) {
      const distance = Math.hypot(
        point.x - this.debugTrailPoints[previousOffset],
        point.y - this.debugTrailPoints[previousOffset + 1],
        point.z - this.debugTrailPoints[previousOffset + 2],
      );
      if (distance < 0.008) return;
    }
    this.debugTrailPoints.push(point.x, point.y, point.z);
    const maximumPoints = Math.max(
      20,
      Math.round(Number(POND_GAME.climbing.debug?.trailMaxPoints) || 400),
    );
    if (this.debugTrailPoints.length > maximumPoints * 3) {
      this.debugTrailPoints.splice(0, this.debugTrailPoints.length - maximumPoints * 3);
    }
    this.setDebugPositions(this.debugTrail, this.debugTrailPoints);
  }

  setDebugPositions(line, positions) {
    if (!line?.geometry) return;
    line.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    line.geometry.computeBoundingSphere();
  }

  disposeDebugOverlay() {
    if (!this.debugGroup) return;
    this.app.removeWorldObject(this.debugGroup);
    this.debugGroup.traverse((object) => {
      if (!object.userData.climbDebugSharedGeometry) object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose?.();
    });
    this.debugGroup = null;
    this.debugSurfaceMask = null;
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.route) this.app.setAntMotionLocked(false);
    this.app.setAntAnimationPlaying(false);
    this.route = null;
    this.nearbyRoute = null;
    this.phase = 'ground';
    this.surfaceRole = null;
    this.clearMovementInput();
    this.setPrompt('');
    this.disposeGameplayContactMarker();
    this.disposeDebugOverlay();
  }
}
