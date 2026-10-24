import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { PERFORMANCE, SCENE_PROPS, getHabitatArea } from '../config/index.js';
import {
  createFrameAnimationClip,
  resolveAnimationClip,
} from '../props/model-animation.js';

function createBackgroundAntWalkClip(animations) {
  const recipe = SCENE_PROPS.ant.animation ?? {};
  const sourceClip = resolveAnimationClip(animations, recipe.clip ?? 0);
  return createFrameAnimationClip(sourceClip, {
    framesPerSecond: recipe.framesPerSecond,
    removeTracks: ['ant.position', 'ant.quaternion'],
    name: 'walk',
    frames: recipe.ranges?.walk,
  });
}

const wandererMethods = {
  placeCockroach(heroPosition, ground) {
    if (!this.cockroach || !ground) return false;
    const start = this.findCockroachDestination(heroPosition, ground, { validatePath: false });
    if (!start) return false;
    this.cockroach.setTargetWidth(SCENE_PROPS.cockroach.targetWidth);
    this.cockroach.placeAt(start, Math.random() * Math.PI * 2);
    this.cockroach.group.position.y += SCENE_PROPS.cockroach.lift;
    this.cockroachState = {
      mode: 'idle',
      remaining: this.randomCockroachDuration('idle'),
      target: start.clone(),
    };
    return true;
  },

  findCockroachDestination(origin, ground, { validatePath = true } = {}) {
    const half = this.settings.area === 'pond' ? getHabitatArea().detailSize * 0.5 - 0.65 : 12;
    const base = origin ?? this.tree?.group?.position ?? new THREE.Vector3();
    const clearance = SCENE_PROPS.cockroach.collisionRadius;
    destinationSearch:
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const sceneWide = Math.random() < SCENE_PROPS.cockroach.wanderSceneChance;
      const angle = Math.random() * Math.PI * 2;
      const minimumDistance = SCENE_PROPS.cockroach.wanderMinimumDistance;
      const distance = minimumDistance + Math.random()
        * (SCENE_PROPS.cockroach.wanderMaximumDistance - minimumDistance);
      const x = sceneWide
        ? THREE.MathUtils.lerp(-half, half, Math.random())
        : THREE.MathUtils.clamp(base.x + Math.cos(angle) * distance, -half, half);
      const z = sceneWide
        ? THREE.MathUtils.lerp(-half, half, Math.random())
        : THREE.MathUtils.clamp(base.z + Math.sin(angle) * distance, -half, half);
      const pathSamples = validatePath
        ? Math.min(12, Math.max(1, Math.ceil(Math.hypot(x - base.x, z - base.z) / 0.4)))
        : 1;
      for (let sample = 1; sample <= pathSamples; sample += 1) {
        const progress = validatePath ? sample / pathSamples : 1;
        const sampleX = THREE.MathUtils.lerp(base.x, x, progress);
        const sampleZ = THREE.MathUtils.lerp(base.z, z, progress);
        if (!this.canBackgroundAntOccupy(sampleX, sampleZ, ground, clearance)) {
          continue destinationSearch;
        }
      }
      return new THREE.Vector3(x, ground.surfaceHeightAt?.(x, z) ?? ground.heightAt(x, z), z);
    }
    return null;
  },

  randomCockroachDuration(mode) {
    const config = SCENE_PROPS.cockroach;
    const minimum = mode === 'walk' ? config.walkMinimumSeconds : config.idleMinimumSeconds;
    const maximum = mode === 'walk' ? config.walkMaximumSeconds : config.idleMaximumSeconds;
    return minimum + Math.random() * (maximum - minimum);
  },

  updateCockroach(delta) {
    const state = this.cockroachState;
    const group = this.cockroach?.group;
    if (!state || !group || !this.ground) return;
    state.remaining -= delta;
    if (state.mode === 'walk') {
      const direction = this.cockroachMoveDirection.copy(state.target).sub(group.position).setY(0);
      const distance = direction.length();
      if (distance > 0.025) {
        direction.multiplyScalar(1 / distance);
        group.position.addScaledVector(direction, Math.min(distance, SCENE_PROPS.cockroach.walkSpeed * delta));
        group.position.y = (this.ground.surfaceHeightAt?.(group.position.x, group.position.z)
          ?? this.ground.heightAt(group.position.x, group.position.z)) + SCENE_PROPS.cockroach.lift;
        group.rotation.y = Math.atan2(direction.x, direction.z)
          + THREE.MathUtils.degToRad(SCENE_PROPS.cockroach.yawOffset);
      } else {
        state.remaining = 0;
      }
    }
    if (state.remaining > 0) return;
    if (state.mode === 'idle') {
      const nextTarget = this.findCockroachDestination(group.position, this.ground);
      if (!nextTarget) {
        state.remaining = this.randomCockroachDuration('idle');
        return;
      }
      state.mode = 'walk';
      state.target.copy(nextTarget);
      state.remaining = this.randomCockroachDuration('walk');
      this.cockroachActions?.idle.fadeOut(0.22);
      this.cockroachActions?.walk.reset().fadeIn(0.22).play();
      return;
    }
    state.mode = 'idle';
    state.remaining = this.randomCockroachDuration('idle');
    this.cockroachActions?.walk.fadeOut(0.22);
    this.cockroachActions?.idle.reset().fadeIn(0.22).play();
  },

  randomBackgroundAntDuration(mode) {
    const config = SCENE_PROPS.ant;
    const minimum = mode === 'walk'
      ? config.backgroundWalkMinimumSeconds
      : config.backgroundIdleMinimumSeconds;
    const maximum = mode === 'walk'
      ? config.backgroundWalkMaximumSeconds
      : config.backgroundIdleMaximumSeconds;
    return minimum + Math.random() * (maximum - minimum);
  },

  canBackgroundAntOccupy(x, z, ground = this.ground, collisionRadius = SCENE_PROPS.ant.collisionRadius) {
    if (!ground || !Number.isFinite(x) || !Number.isFinite(z)) return false;
    const config = SCENE_PROPS.ant;
    const habitat = getHabitatArea(this.settings.area);
    const halfSize = habitat.detailSize * 0.5 - collisionRadius;
    if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) return false;
    if (ground.containsPond?.(x, z, 0.18)) return false;

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
      if (containsGroundPoint) return containsGroundPoint(x, z, collisionRadius);
      return Math.hypot(x - collider.x, z - collider.z)
        < collider.radius + collisionRadius;
    })) return false;
    if (ground.containsRock?.(x, z, collisionRadius)) return false;
    for (const reservation of this.groundReservations) {
      if (Math.hypot(x - reservation.position.x, z - reservation.position.z)
        < reservation.radius + collisionRadius) return false;
    }
    if (this.modelGroundColliders.some((collider) => (
      collider.blocksGround
      && collider.footprint.containsGroundPoint(x, z, collisionRadius)
    ))) return false;
    if ([...this.gameGroundBlockers.values()].some((blocker) => {
      const radiusX = blocker.radiusX + collisionRadius;
      const radiusZ = blocker.radiusZ + collisionRadius;
      const offsetX = (x - blocker.x) / radiusX;
      const offsetZ = (z - blocker.z) / radiusZ;
      return offsetX * offsetX + offsetZ * offsetZ < 1;
    })) return false;
    return true;
  },

  findBackgroundAntDestination(wanderer, fromPosition = null, ground = this.ground) {
    const config = SCENE_PROPS.ant;
    const origin = fromPosition ?? wanderer.anchor;
    const minimumDistance = config.backgroundWanderMinimumDistance;
    const maximumDistance = config.backgroundWanderMaximumDistance;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = minimumDistance + Math.random() * (maximumDistance - minimumDistance);
      const x = THREE.MathUtils.clamp(
        origin.x + Math.sin(angle) * distance,
        wanderer.anchor.x - wanderer.radius,
        wanderer.anchor.x + wanderer.radius,
      );
      const z = THREE.MathUtils.clamp(
        origin.z + Math.cos(angle) * distance,
        wanderer.anchor.z - wanderer.radius,
        wanderer.anchor.z + wanderer.radius,
      );
      if (!this.canBackgroundAntOccupy(x, z, ground)) continue;
      return new THREE.Vector3(
        x,
        (ground.surfaceHeightAt?.(x, z) ?? ground.heightAt(x, z)) + config.lift,
        z,
      );
    }
    return null;
  },

  placeBackgroundAnts(ground, world) {
    this.backgroundAntMixers.forEach((mixer) => mixer.stopAllAction());
    this.backgroundAntMixers = [];
    this.backgroundAnts = [];
    if (!PERFORMANCE.backgroundAnts || !this.ant?.group || !ground || !world) return;
    const sourceClip = createBackgroundAntWalkClip(this.ant.animations);
    if (!sourceClip) return;
    const config = SCENE_PROPS.ant;
    config.backgroundWanderers.forEach((anchorConfig, index) => {
      const placeholder = {
        anchor: new THREE.Vector3(anchorConfig.x, 0, anchorConfig.z),
        radius: anchorConfig.radius,
      };
      const start = this.findBackgroundAntDestination(placeholder, placeholder.anchor, ground);
      if (!start) return;
      const group = cloneSkeleton(this.ant.group);
      group.name = `Background wandering ant ${index + 1}`;
      group.position.copy(start);
      group.rotation.set(0, THREE.MathUtils.degToRad(anchorConfig.yaw ?? 0), 0);
      const relativeScale = THREE.MathUtils.clamp(
        Number(anchorConfig.scale) || 1,
        0.1,
        100,
      );
      const targetWidth = SCENE_PROPS.ant.targetWidth * relativeScale;
      const horizontalSize = Math.max(Number(this.ant.horizontalSize) || 0, 0.001);
      group.scale.setScalar(targetWidth / horizontalSize);
      group.visible = true;
      const mixer = new THREE.AnimationMixer(group);
      const action = mixer.clipAction(sourceClip.clone());
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.timeScale = (Number(config.animation?.speed) || 1) * 0.82;
      action.play();
      action.paused = true;
      const wanderer = {
        group,
        mixer,
        action,
        anchor: placeholder.anchor,
        radius: anchorConfig.radius,
        mode: 'idle',
        remaining: this.randomBackgroundAntDuration('idle'),
        target: start.clone(),
        direction: new THREE.Vector3(),
      };
      this.backgroundAnts.push(wanderer);
      this.backgroundAntMixers.push(mixer);
      world.add(group);
    });
  },

  updateBackgroundAnts(delta) {
    const config = SCENE_PROPS.ant;
    for (const wanderer of this.backgroundAnts) {
      const group = wanderer.group;
      if (!group?.parent || !this.ground) continue;
      wanderer.remaining -= delta;
      if (wanderer.mode === 'walk') {
        const direction = wanderer.direction.copy(wanderer.target).sub(group.position).setY(0);
        const distance = direction.length();
        if (distance > 0.015) {
          direction.multiplyScalar(1 / distance);
          group.position.addScaledVector(direction, Math.min(distance, config.backgroundWalkSpeed * delta));
          group.position.y = (this.ground.surfaceHeightAt?.(group.position.x, group.position.z)
            ?? this.ground.heightAt(group.position.x, group.position.z)) + config.lift;
          group.rotation.y = Math.atan2(direction.x, direction.z)
            + THREE.MathUtils.degToRad(config.yawOffset);
        } else {
          wanderer.remaining = 0;
        }
      }
      if (wanderer.remaining > 0) continue;
      if (wanderer.mode === 'idle') {
        const nextTarget = this.findBackgroundAntDestination(wanderer, group.position);
        if (!nextTarget) {
          wanderer.remaining = this.randomBackgroundAntDuration('idle');
          continue;
        }
        wanderer.mode = 'walk';
        wanderer.target.copy(nextTarget);
        wanderer.remaining = this.randomBackgroundAntDuration('walk');
        wanderer.action.paused = false;
        continue;
      }
      wanderer.mode = 'idle';
      wanderer.remaining = this.randomBackgroundAntDuration('idle');
      wanderer.action.paused = true;
    }
  },
};

export function installPondWandererMethods(PondApp) {
  Object.entries(wandererMethods).forEach(([name, method]) => {
    Object.defineProperty(PondApp.prototype, name, {
      configurable: true,
      writable: true,
      value: method,
    });
  });
}
