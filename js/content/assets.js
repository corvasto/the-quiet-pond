import { resolveAssetUrl } from '../utils/asset-url.js';

const COMPRESSED_MODEL_EXTENSION = typeof __COMPRESSED_MODELS__ !== 'undefined'
  && __COMPRESSED_MODELS__
  ? '.glb.gz'
  : '.glb';

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const freezeVector = (value = {}) => Object.freeze({
  x: finiteNumber(value.x),
  y: finiteNumber(value.y),
  z: finiteNumber(value.z),
});

function freezeAnimation(animation) {
  if (!animation) return null;
  const freezeRanges = (ranges) => ranges && Object.freeze(Object.fromEntries(
    Object.entries(ranges).map(([name, frames]) => [
      name,
      Array.isArray(frames) ? Object.freeze([...frames]) : frames,
    ]),
  ));
  return Object.freeze({
    ...animation,
    frames: Array.isArray(animation.frames) ? Object.freeze([...animation.frames]) : animation.frames,
    ranges: freezeRanges(animation.ranges),
    clips: animation.clips ? Object.freeze({ ...animation.clips }) : animation.clips,
    speeds: animation.speeds ? Object.freeze({ ...animation.speeds }) : animation.speeds,
    removeTracks: Array.isArray(animation.removeTracks)
      ? Object.freeze([...animation.removeTracks])
      : animation.removeTracks,
  });
}

function defineAsset({
  file,
  label,
  loadErrorMessage,
  size,
  orientation = {},
  placement = {},
  animation = null,
  // modes selects where the asset is included and loaded. requiredModes is a subset
  // where a load failure stops startup; failures in other selected modes stay optional.
  modes = ['game'],
  requiredModes = [],
  requires = null,
  runtime = {},
}) {
  if (!file || !label || !Number.isFinite(size?.width)) {
    throw new TypeError('Asset descriptors require file, label, and size.width.');
  }
  return Object.freeze({
    file,
    url: resolveAssetUrl(
      `./assets/models/${file.replace(/\.glb$/i, COMPRESSED_MODEL_EXTENSION)}`,
      `../../assets/models/${file}`,
      import.meta.url,
    ),
    label,
    loadErrorMessage: loadErrorMessage ?? `The ${label} model could not be loaded:`,
    size: Object.freeze({ width: Math.max(0.001, size.width) }),
    orientation: Object.freeze({
      // yawDegrees is an authored world heading. yawOffsetDegrees corrects the GLB forward axis.
      yawDegrees: finiteNumber(orientation.yawDegrees),
      yawOffsetDegrees: finiteNumber(orientation.yawOffsetDegrees),
      rotationDegrees: freezeVector(orientation.rotationDegrees),
    }),
    placement: Object.freeze({
      // Specialized strategies may consume anchor or relativeTo as adapter metadata.
      strategy: placement.strategy ?? 'custom',
      anchor: placement.anchor ?? null,
      relativeTo: placement.relativeTo ?? null,
      position: placement.position ? freezeVector(placement.position) : null,
      pondAngle: Number.isFinite(placement.pondAngle) ? placement.pondAngle : null,
      pondInset: Number.isFinite(placement.pondInset) ? placement.pondInset : null,
      // lift corrects surface contact; clearingRadius reserves vegetation, not collision.
      lift: finiteNumber(placement.lift),
      clearingRadius: Math.max(0, finiteNumber(placement.clearingRadius)),
      count: Number.isFinite(placement.count) ? Math.max(0, Math.floor(placement.count)) : null,
      offset: freezeVector(placement.offset),
    }),
    animation: freezeAnimation(animation),
    modes: Object.freeze([...modes]),
    requiredModes: Object.freeze([...requiredModes]),
    requires,
    runtime: Object.freeze(runtime),
  });
}

export const ASSET_CATALOG = Object.freeze({
  radio: defineAsset({
    file: 'old_radio.glb',
    label: 'Old radio on woodland rock',
    loadErrorMessage: 'The old radio model could not be loaded:',
    size: { width: 0.8 },
    orientation: { yawOffsetDegrees: 45 },
    placement: {
      strategy: 'pond-rock',
      anchor: 'ground.rockAnchor',
      lift: 0.012,
      offset: { x: 5.9, y: 0.1, z: -8.7 },
    },
    runtime: {
      groundCollisionHeight: 0.32,
      climbProxyCellSize: 0.035,
      climbProxyMinimumTriangleArea: 0.000001,
      climbProxyGroundCollisionHeight: 0.32,
    },
    requiredModes: ['game'],
  }),
  reader: defineAsset({
    file: 'quiet_reading.glb',
    label: 'Quiet reader beneath the tree',
    loadErrorMessage: 'The quiet reading model could not be loaded:',
    size: { width: 1.92 },
    orientation: { yawOffsetDegrees: 190 },
    placement: {
      strategy: 'ground-offset',
      anchor: 'heroTree',
      lift: 0.012,
      offset: { x: 2.2, y: 0, z: -1.8 },
    },
    runtime: {
      collisionScale: 0.68,
      climbProxyCellSize: 0.06,
      climbProxyMinimumTriangleArea: 0.000001,
      climbProxyGroundCollisionHeight: 0.3,
    },
    requiredModes: ['game'],
  }),
  ant: defineAsset({
    file: 'ant.glb',
    label: 'Ant near the ash tree',
    loadErrorMessage: 'The ant model could not be loaded:',
    size: { width: 0.09 },
    placement: {
      strategy: 'ground-offset',
      anchor: 'heroTree',
      lift: 0.006,
      clearingRadius: 0.42,
      offset: { x: -1.25, y: 0, z: 1.15 },
    },
    animation: {
      speed: 3.6,
      framesPerSecond: 30,
      ranges: Object.freeze({
        idle: Object.freeze([200, 360]),
        walk: Object.freeze([363, 439]),
        eat: Object.freeze([440, 776]),
        cockroach: Object.freeze([1415, 1700]),
      }),
    },
    runtime: {
      moveSpeed: 0.29,
      runMultiplier: 3,
      runAnimationMultiplier: 2.2,
      turnSpeed: 7,
      movementRadius: 2.8,
      collisionRadius: 0.055,
      treeCollisionRadius: 0.72,
      cameraOffset: Object.freeze({ x: 0.8, y: 0.24, z: -0.68 }),
      cameraLookHeight: 0.035,
      backgroundWanderers: Object.freeze([
        Object.freeze({ x: -12.6, z: 12, radius: 1.7, yaw: 145, scale: 1.5 }),
        Object.freeze({ x: -12.7, z: -12, radius: 1.8, yaw: -145, scale: 0.8 }),
      ]),
      backgroundWanderMinimumDistance: 0.25,
      backgroundWanderMaximumDistance: 1.35,
      backgroundWalkSpeed: 0.16,
      backgroundIdleMinimumSeconds: 0.8,
      backgroundIdleMaximumSeconds: 2.8,
      backgroundWalkMinimumSeconds: 1.4,
      backgroundWalkMaximumSeconds: 5.6,
    },
    requiredModes: ['game'],
  }),
  streetLamp: defineAsset({
    file: 'street_light_lamp.glb',
    label: 'Corner street lamp',
    loadErrorMessage: 'The street lamp model could not be loaded:',
    size: { width: 0.85 },
    orientation: { yawDegrees: -135 },
    placement: {
      strategy: 'habitat-corner',
      lift: 0.006,
      clearingRadius: 0.78,
    },
    runtime: {
      cornerInset: 1.25,
      groundCollisionHeight: 0.32,
      lightHeightFraction: 0.84,
      lightIntensity: 75,
      lightDistance: 850,
    },
    requiredModes: ['game'],
  }),
  tent: defineAsset({
    file: 'tent.glb',
    label: 'Tent beside the street lamp',
    loadErrorMessage: 'The tent model could not be loaded:',
    size: { width: 6.3 },
    orientation: { yawDegrees: 115 },
    placement: {
      strategy: 'relative-ground',
      relativeTo: 'streetLamp',
      offset: { x: -4.9, z: -3.9 },
      lift: 0,
      clearingRadius: 1.5,
    },
    runtime: {
      groundCollisionHeight: 0.3,
    },
    requiredModes: ['game'],
  }),
  frog: defineAsset({
    file: 'common_frog.glb',
    label: 'Frog near the pond',
    loadErrorMessage: 'The frog model could not be loaded:',
    size: { width: 0.25 },
    placement: {
      strategy: 'pond-edge',
      anchor: 'pondProfile',
      pondAngle: 4.55,
      pondInset: -0.62,
      lift: 0.008,
      clearingRadius: 0.8,
    },
    requiredModes: ['game'],
  }),
  cockroach: defineAsset({
    file: 'cockroach.glb',
    label: 'Wandering cockroach',
    requiredModes: ['game'],
    loadErrorMessage: 'The cockroach model could not be loaded:',
    size: { width: 0.36 },
    orientation: { yawOffsetDegrees: 180 },
    placement: { strategy: 'ground-wanderer', lift: 0.006 },
    animation: {
      clips: Object.freeze({
        idle: 'giant_cockroach_armature|idle',
        walk: 'giant_cockroach_armature|walking',
      }),
      speeds: Object.freeze({ idle: 1.1, walk: 9.9 }),
    },
    runtime: {
      collisionRadius: 0.18,
      walkSpeed: 0.6,
      wanderMinimumDistance: 0.45,
      wanderMaximumDistance: 2.1,
      wanderSceneChance: 0.28,
      idleMinimumSeconds: 0.7,
      idleMaximumSeconds: 2.2,
      walkMinimumSeconds: 2.2,
      walkMaximumSeconds: 9.6,
    },
  }),
  lollipop: defineAsset({
    file: 'lollipop.glb',
    label: 'Lollipop for the ant',
    loadErrorMessage: 'The lollipop model could not be loaded:',
    size: { width: 0.22 },
    orientation: { rotationDegrees: { z: 180 } },
    placement: {
      strategy: 'game-anchor',
      position: { x: -6.2, z: 4.65 },
      lift: 0.006,
      clearingRadius: 0.32,
    },
    runtime: {
      // World-space offset from the inverted model origin to the candy center.
      objectiveOffset: Object.freeze({ x: 0, y: -0.241, z: 0.039 }),
    },
    modes: ['game'],
    requiredModes: ['game'],
  }),
  cat: defineAsset({
    file: 'an_animated_cat.glb',
    label: 'Animated cat on an ash branch',
    loadErrorMessage: 'The animated cat model could not be loaded:',
    size: { width: 0.68 },
    placement: { strategy: 'tree-anchor', lift: 0.012 },
    animation: {
      clip: 0,
      speed: 1,
      removeTracks: Object.freeze(['j_body_00_12.position']),
    },
    requires: 'animatedCat',
    requiredModes: ['game'],
  }),
  narcissus: defineAsset({
    file: 'generic_narcissus_flower.glb',
    label: 'Narcissus flower',
    loadErrorMessage: 'The narcissus flower model could not be loaded:',
    size: { width: 0.32 },
    placement: {
      strategy: 'scattered-ground',
      lift: 0.004,
      clearingRadius: 0.28,
      count: 9,
    },
    requires: 'modelFlowers',
  }),
  purpleFlower: defineAsset({
    file: 'purple_flower.glb',
    label: 'Purple flower',
    loadErrorMessage: 'The purple flower model could not be loaded:',
    size: { width: 0.8 },
    placement: {
      strategy: 'scattered-ground',
      lift: -0.1,
      clearingRadius: 0.28,
      count: 4,
    },
    requires: 'modelFlowers',
  }),
});

function compileAsset(descriptor) {
  const degreesToRadians = Math.PI / 180;
  return Object.freeze({
    url: descriptor.url,
    modelName: descriptor.label,
    loadErrorMessage: descriptor.loadErrorMessage,
    targetWidth: descriptor.size.width,
    lift: descriptor.placement.lift,
    clearingRadius: descriptor.placement.clearingRadius,
    count: descriptor.placement.count,
    offset: descriptor.placement.offset,
    placementStrategy: descriptor.placement.strategy,
    placement: descriptor.placement,
    yaw: descriptor.orientation.yawDegrees,
    yawOffset: descriptor.orientation.yawOffsetDegrees,
    rotation: Object.freeze({
      x: descriptor.orientation.rotationDegrees.x * degreesToRadians,
      y: descriptor.orientation.rotationDegrees.y * degreesToRadians,
      z: descriptor.orientation.rotationDegrees.z * degreesToRadians,
    }),
    modes: descriptor.modes,
    requiredModes: descriptor.requiredModes,
    animation: descriptor.animation,
    ...descriptor.runtime,
  });
}

export function createSceneProps(performance = {}) {
  return Object.freeze(Object.fromEntries(
    Object.entries(ASSET_CATALOG)
      .filter(([, descriptor]) => !descriptor.requires || performance[descriptor.requires] === true)
      .map(([id, descriptor]) => [id, compileAsset(descriptor)]),
  ));
}

export function getAssetDescriptor(id) {
  return ASSET_CATALOG[id] ?? null;
}

export function selectSceneProps(sceneProps, mode = 'game') {
  if (mode !== 'game') throw new RangeError('Only game asset mode is supported.');
  const selectedMode = 'game';
  return Object.freeze(Object.fromEntries(
    Object.entries(sceneProps ?? {})
      .filter(([, config]) => config.modes?.includes(selectedMode) !== false)
      .map(([id, config]) => [id, Object.freeze({
        ...config,
        required: config.requiredModes?.includes(selectedMode) === true,
      })]),
  ));
}
