import * as THREE from 'three';
import { SCENE_PROPS } from '../config/index.js';

const WORLD_QUERY_METHODS = {
  setModelVisibility(id, visible) {
    const model = this.modelProps[id];
    if (!model) return false;
    model.group.visible = Boolean(visible);
    return true;
  },

  isModelVisible(id) {
    return Boolean(this.modelProps[id]?.group.visible);
  },

  getAntWorldPosition(target = new THREE.Vector3()) {
    if (!this.ant?.group?.parent) return null;
    return this.ant.group.getWorldPosition(target);
  },

  getCockroachWorldPosition(target = new THREE.Vector3()) {
    if (!this.cockroach?.group?.parent) return null;
    return this.cockroach.group.getWorldPosition(target);
  },

  getAntFacingDirection(target = new THREE.Vector3()) {
    if (!this.ant?.group?.parent) return null;
    const yawOffset = THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
    const movementYaw = this.ant.group.rotation.y - yawOffset;
    return target.set(
      Math.sin(movementYaw),
      0,
      Math.cos(movementYaw),
    ).normalize();
  },

  getGroundWorldPosition(x, z, target = new THREE.Vector3()) {
    if (!this.ground || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    return target.set(x, this.ground.heightAt(x, z), z);
  },

  getAntSupportPosition(x, z, target = new THREE.Vector3()) {
    if (!this.ground || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const onWater = this.ground.containsPond?.(x, z, -0.045) ?? false;
    const supportHeight = onWater && this.activePondWater
      ? this.activePondWater.getSurfaceHeight(x, z) + 0.008
      : this.ground.heightAt(x, z);
    return target.set(x, supportHeight, z);
  },

  getAntGroundPosition(x, z, target = new THREE.Vector3()) {
    const support = this.getAntSupportPosition(x, z, target);
    if (!support) return null;
    support.y += SCENE_PROPS.ant.lift + SCENE_PROPS.ant.offset.y;
    return support;
  },

  getAntGroundPositionFromScreen(clientX, clientY, target = new THREE.Vector3()) {
    if (
      !this.ground?.terrainSurface
      || !Number.isFinite(clientX)
      || !Number.isFinite(clientY)
    ) return null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pondStonePointer.set(
      (clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1,
      -(clientY - bounds.top) / Math.max(1, bounds.height) * 2 + 1,
    );
    this.pondStoneRaycaster.setFromCamera(this.pondStonePointer, this.camera);
    const hit = this.pondStoneRaycaster.intersectObject(this.ground.terrainSurface, false)[0];
    if (!hit) return null;
    return this.getAntGroundPosition(hit.point.x, hit.point.z, target);
  },

  addWorldObject(object) {
    if (!object?.isObject3D || !this.world) return false;
    this.world.add(object);
    this.worldAdditions.add(object);
    return true;
  },

  removeWorldObject(object) {
    if (!object?.isObject3D) return false;
    object.removeFromParent();
    return this.worldAdditions.delete(object);
  },

  addGameGroundBlocker(id, position, radius) {
    if (!id || !position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return false;
    const options = typeof radius === 'object' && radius !== null ? radius : { radius };
    const safeRadius = Math.max(0.01, Number(options.radius) || 0);
    const radiusX = Math.max(0.01, Number(options.radiusX) || safeRadius);
    const radiusZ = Math.max(0.01, Number(options.radiusZ) || safeRadius);
    this.gameGroundBlockers.set(String(id), {
      x: position.x,
      z: position.z,
      radiusX,
      radiusZ,
    });
    return true;
  },

  removeGameGroundBlocker(id) {
    return this.gameGroundBlockers.delete(String(id));
  },

  attachObjectToAnt(object, offset = {}) {
    if (!object?.isObject3D || !this.ant?.group) return false;
    const parentScale = this.ant.group.getWorldScale(this.antAttachmentScale);
    const scaleX = Math.max(Math.abs(parentScale.x), 0.000001);
    const scaleY = Math.max(Math.abs(parentScale.y), 0.000001);
    const scaleZ = Math.max(Math.abs(parentScale.z), 0.000001);
    this.ant.group.add(object);
    object.position.set(
      (Number(offset.x) || 0) / scaleX,
      (Number(offset.y) || 0) / scaleY,
      (Number(offset.z) || 0) / scaleZ,
    );
    object.scale.set(
      object.scale.x / scaleX,
      object.scale.y / scaleY,
      object.scale.z / scaleZ,
    );
    this.worldAdditions.add(object);
    return true;
  },

  onFrame(listener) {
    if (typeof listener !== 'function') return () => {};
    this.frameUpdateListeners.add(listener);
    return () => this.frameUpdateListeners.delete(listener);
  },

  notifyFrameUpdateListeners(delta, elapsed) {
    this.frameEvent.delta = delta;
    this.frameEvent.elapsed = elapsed;
    for (const listener of this.frameUpdateListeners) {
      try {
        listener(this.frameEvent);
      } catch (error) {
        this.frameUpdateListeners.delete(listener);
        console.error('A frame listener was removed after an error.', error);
      }
    }
  },

  raycastSurface(object, origin, direction, {
    recursive = true,
    instanceId = null,
    targetPosition = new THREE.Vector3(),
    targetNormal = new THREE.Vector3(),
  } = {}) {
    if (
      !object?.isObject3D
      || !Number.isFinite(origin?.x)
      || !Number.isFinite(origin?.y)
      || !Number.isFinite(origin?.z)
      || !Number.isFinite(direction?.x)
      || !Number.isFinite(direction?.y)
      || !Number.isFinite(direction?.z)
    ) return null;
    this.surfaceRayDirection.copy(direction);
    if (this.surfaceRayDirection.lengthSq() < 0.000001) return null;
    this.surfaceRayDirection.normalize();
    this.surfaceRayOrigin.copy(origin);
    object.updateWorldMatrix(true, true);
    this.surfaceRaycaster.set(this.surfaceRayOrigin, this.surfaceRayDirection);
    const hit = this.surfaceRaycaster
      .intersectObject(object, recursive)
      .find((intersection) => (
        instanceId === null || intersection.instanceId === instanceId
      ));
    if (!hit) return null;

    const normalMatrixSource = hit.object?.matrixWorld;
    if (hit.object?.isInstancedMesh && Number.isInteger(hit.instanceId)) {
      hit.object.getMatrixAt(hit.instanceId, this.surfaceRayInstanceMatrix);
      this.surfaceRayInstanceMatrix.premultiply(hit.object.matrixWorld);
      this.surfaceRayNormalMatrix.getNormalMatrix(this.surfaceRayInstanceMatrix);
    } else if (normalMatrixSource) {
      this.surfaceRayNormalMatrix.getNormalMatrix(normalMatrixSource);
    }

    targetPosition.copy(hit.point);
    if (hit.normal?.lengthSq?.() > 0) {
      targetNormal.copy(hit.normal).applyNormalMatrix(this.surfaceRayNormalMatrix).normalize();
    } else if (hit.face?.normal) {
      targetNormal.copy(hit.face.normal).applyNormalMatrix(this.surfaceRayNormalMatrix).normalize();
    } else {
      targetNormal.copy(this.surfaceRayDirection).negate();
    }
    if (targetNormal.dot(this.surfaceRayDirection) > 0) targetNormal.negate();
    return {
      position: targetPosition,
      normal: targetNormal,
      object: hit.object,
      instanceId: hit.instanceId,
    };
  },

  getRockSurfacePosition(rockIndex, x, z, target = new THREE.Vector3()) {
    if (!this.ground?.getRockSurfacePoint) return null;
    const surface = this.ground.getRockSurfacePoint(
      rockIndex,
      x,
      z,
      this.rockSurfaceLocal,
    );
    if (!surface) return null;
    return this.ground.group.localToWorld(target.copy(surface));
  },

  getSceneLandmarks() {
    const describeTree = (sourceTree, treeIndex) => {
      const treeGroup = sourceTree?.group;
      if (!treeGroup?.parent) return null;
      treeGroup.updateWorldMatrix(true, true);
      const transformTreeAnchor = (anchor) => {
        if (!anchor?.position || !anchor?.direction) return null;
        const direction = anchor.direction
          .clone()
          .transformDirection(treeGroup.matrixWorld)
          .setY(0);
        if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1);
        direction.normalize();
        return {
          position: treeGroup.localToWorld(anchor.position.clone()),
          direction,
          radius: anchor.radius,
        };
      };
      const worldScale = treeGroup.getWorldScale(new THREE.Vector3());
      const bounds = new THREE.Box3().setFromObject(sourceTree.woodMesh ?? treeGroup, true);
      return {
        position: treeGroup.getWorldPosition(new THREE.Vector3()),
        baseRadius: (sourceTree.stats?.baseRadius ?? SCENE_PROPS.ant.treeCollisionRadius)
          * Math.max(worldScale.x, worldScale.z),
        climb: transformTreeAnchor(sourceTree.climbAnchor),
        perch: transformTreeAnchor(sourceTree.perchAnchor),
        surfaceObject: sourceTree.woodMesh ?? treeGroup,
        groundFootprint: this.treeGroundColliders[treeIndex]?.footprint ?? null,
        bounds: bounds.isEmpty() ? null : {
          min: bounds.min.clone(),
          max: bounds.max.clone(),
        },
      };
    };
    const tree = describeTree(this.tree, 0);
    const trees = [
      tree,
      ...(this.forest?.trees ?? []).map((sourceTree, index) => describeTree(sourceTree, index + 1)),
    ].filter(Boolean);

    const rockAnchors = (this.ground?.rockSurfaceAnchors ?? []).map((anchor) => {
      const position = this.ground.group.localToWorld(new THREE.Vector3(
        anchor.position.x,
        anchor.position.y,
        anchor.position.z,
      ));
      return {
        source: 'ground',
        rockIndex: anchor.rockIndex,
        position,
        basePosition: this.ground.group.localToWorld(new THREE.Vector3(
          anchor.position.x,
          this.ground.heightAt(anchor.position.x, anchor.position.z),
          anchor.position.z,
        )),
        usableRadius: anchor.usableRadius,
        footprint: { ...anchor.footprint },
        surfaceObject: this.ground?.rockSurfaceMesh ?? null,
      };
    });
    const pondRockAnchors = (this.ground?.pondRockSurfaceAnchors ?? []).map((anchor) => {
      const position = this.ground.group.localToWorld(new THREE.Vector3(
        anchor.position.x,
        anchor.position.y,
        anchor.position.z,
      ));
      return {
        source: 'shoreline',
        id: anchor.id ?? `pond-rock-${anchor.rockIndex}`,
        label: anchor.label ?? 'a pond rock',
        rockIndex: anchor.rockIndex,
        position,
        basePosition: this.ground.group.localToWorld(new THREE.Vector3(
          anchor.position.x,
          this.ground.heightAt(anchor.position.x, anchor.position.z),
          anchor.position.z,
        )),
        usableRadius: anchor.usableRadius,
        footprint: { ...anchor.footprint },
        surfaceObject: this.ground?.pondRockSurfaceMesh ?? null,
      };
    });
    const describeModel = (model, extra = {}) => {
      if (!model?.group?.parent) return null;
      model.group.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(model.group, true);
      if (bounds.isEmpty()) return null;
      const forward = new THREE.Vector3(0, 0, 1)
        .transformDirection(model.group.matrixWorld)
        .setY(0);
      if (forward.lengthSq() < 0.000001) forward.set(0, 0, 1);
      forward.normalize();
      return {
        position: model.group.getWorldPosition(new THREE.Vector3()),
        bounds: {
          min: bounds.min.clone(),
          max: bounds.max.clone(),
        },
        size: bounds.getSize(new THREE.Vector3()),
        forward,
        surfaceObject: model.group,
        ...extra,
      };
    };
    const radioSupport = this.ground?.rockAnchor
      ? rockAnchors.find((anchor) => anchor.rockIndex === this.ground.rockAnchor.rockIndex) ?? null
      : null;
    return {
      tree,
      trees,
      rocks: [...rockAnchors, ...pondRockAnchors],
      reader: describeModel(this.reader, {
        walkBlockRadius: SCENE_PROPS.reader.targetWidth * this.settings.readerScale * 0.3,
        surfaceObject: this.readerNightBlend > 0.01
          ? null
          : this.readerSurfaceProxy ?? this.reader.group,
        groundFootprint: this.readerNightBlend > 0.01
          ? null
          : this.readerSurfaceProxy?.userData.containsGroundPoint
          ? this.readerSurfaceProxy.userData
          : null,
      }),
      radio: describeModel(this.radio, {
        supportRock: radioSupport,
        surfaceObject: this.radioSurfaceProxy ?? this.radio.group,
        groundFootprint: this.modelGroundColliders
          .find((collider) => collider.id === 'radio')?.footprint ?? null,
      }),
      streetLamp: describeModel(this.streetLamp, {
        groundFootprint: this.modelGroundColliders
          .find((collider) => collider.id === 'streetLamp')?.footprint ?? null,
      }),
      tent: describeModel(this.tent, {
        groundFootprint: this.modelGroundColliders
          .find((collider) => collider.id === 'tent')?.footprint ?? null,
      }),
    };
  },
};

export function installPondWorldQueryMethods(PondApp) {
  if (typeof PondApp !== 'function') {
    throw new TypeError('PondApp must be a class or constructor.');
  }
  Object.entries(WORLD_QUERY_METHODS).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
  return PondApp;
}
