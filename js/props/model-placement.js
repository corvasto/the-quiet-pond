import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEFAULT_PROP_ID = 'default';

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function anchorPoint(anchor) {
  return anchor?.position ?? anchor ?? {};
}

function alignRotatedBaseToY(object, targetY, rotation = {}) {
  const rotatesVerticalAxis = Math.abs(numberOrZero(rotation.x)) > 1e-8
    || Math.abs(numberOrZero(rotation.z)) > 1e-8;
  if (!object || !rotatesVerticalAxis) return;
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object, true);
  if (!bounds.isEmpty()) object.position.y += targetY - bounds.min.y;
}

function centeredSampling(clearing) {
  const center = anchorPoint(clearing?.center);
  const maximum = Number(clearing?.maxDistance);
  if (
    !Number.isFinite(center.x)
    || !Number.isFinite(center.z)
    || !Number.isFinite(maximum)
    || maximum < 0
  ) return null;

  const minimum = Math.max(0, numberOrZero(clearing.minDistance));
  return {
    x: center.x,
    z: center.z,
    minDistance: minimum,
    maxDistance: Math.max(minimum, maximum),
  };
}

function sampleRandomPoint(clearing, random, limit) {
  const sampling = centeredSampling(clearing);
  if (!sampling) {
    return {
      x: random.range(-limit, limit),
      z: random.range(-limit, limit),
      centered: false,
    };
  }

  const angle = random.range(0, TAU);
  const distance = Math.sqrt(random.range(
    sampling.minDistance * sampling.minDistance,
    sampling.maxDistance * sampling.maxDistance,
  ));
  return {
    x: sampling.x + Math.cos(angle) * distance,
    z: sampling.z + Math.sin(angle) * distance,
    centered: true,
  };
}

export function createModelPropPlacement(id, config = {}, options = {}) {
  const {
    count = config.count ?? 1,
    radius = config.clearingRadius ?? 0,
    ...placement
  } = options;
  return {
    ...placement,
    id,
    count,
    radius,
  };
}

export function normalizeModelPropClearings(
  modelPropClearing,
  modelPropClearings,
) {
  return [
    ...(modelPropClearing
      ? [{ id: DEFAULT_PROP_ID, ...modelPropClearing }]
      : []),
    ...(Array.isArray(modelPropClearings) ? modelPropClearings : []),
  ].filter((clearing) => (
    Number.isFinite(clearing?.count)
    && Number.isFinite(clearing?.radius)
    && clearing.radius >= 0
  ));
}

export function createFixedModelPropSpots(clearings) {
  return clearings
    .filter((clearing) => (
      Number.isFinite(clearing?.position?.x)
      && Number.isFinite(clearing?.position?.z)
    ))
    .map((clearing) => ({
      id: clearing.id ?? DEFAULT_PROP_ID,
      x: clearing.position.x,
      z: clearing.position.z,
      radius: clearing.radius,
      yaw: Number(clearing.yaw) || 0,
    }));
}

export function createModelPropSpots({
  clearings,
  fixedSpots,
  halfSize,
  random,
  isInsideTreeClearing,
  containsRock,
  containsPond,
}) {
  const spots = [...fixedSpots];

  clearings.forEach((clearing) => {
    const id = clearing.id ?? DEFAULT_PROP_ID;
    const count = Math.max(0, Math.floor(Number(clearing.count) || 0));
    const radius = Math.max(0, Number(clearing.radius) || 0);
    const propRandom = random.fork(`model-prop-clearings:${id}`);
    const limit = halfSize - radius - 0.35;
    let attempts = 0;

    while (
      spots.filter((spot) => spot.id === id).length < count
      && attempts < count * 80
    ) {
      attempts += 1;
      const point = sampleRandomPoint(clearing, propRandom, limit);
      const { x, z } = point;
      if (
        point.centered
        && (Math.abs(x) > limit || Math.abs(z) > limit)
      ) continue;
      if (isInsideTreeClearing(x, z, radius)) continue;
      if (containsRock(x, z, radius)) continue;
      if (containsPond(x, z, radius + 0.18)) continue;
      if (spots.some((spot) => (
        Math.hypot(x - spot.x, z - spot.z) < radius + spot.radius
      ))) continue;
      spots.push({
        id,
        x,
        z,
        radius,
        yaw: propRandom.range(0, TAU),
      });
    }
  });

  return spots;
}

function getModelPropSpots(ground, id) {
  return ground?.modelPropSpots?.filter((spot) => spot.id === id) ?? [];
}

export function getModelPropSpot(ground, id) {
  return ground?.modelPropSpots?.find((spot) => spot.id === id) ?? null;
}

export function createGroundPosition(
  ground,
  anchor,
  { offset = {}, lift = 0 } = {},
) {
  const point = anchorPoint(anchor);
  const x = numberOrZero(point.x) + numberOrZero(offset.x);
  const z = numberOrZero(point.z) + numberOrZero(offset.z);
  return {
    x,
    y: ground.heightAt(x, z) + numberOrZero(lift) + numberOrZero(offset.y),
    z,
  };
}

export function createAnchorPosition(
  anchor,
  { offset = {}, lift = 0 } = {},
) {
  const point = anchorPoint(anchor);
  return {
    x: numberOrZero(point.x) + numberOrZero(offset.x),
    y: numberOrZero(point.y) + numberOrZero(lift) + numberOrZero(offset.y),
    z: numberOrZero(point.z) + numberOrZero(offset.z),
  };
}

export function yawToward(position, target) {
  return Math.atan2(
    -(numberOrZero(target.z) - numberOrZero(position.z)),
    numberOrZero(target.x) - numberOrZero(position.x),
  );
}

export function placeGroundModelProp({
  model,
  ground,
  anchor,
  config,
  offset = {},
  yaw = anchor?.yaw ?? 0,
  targetWidth = config?.targetWidth,
  parent = null,
}) {
  if (!model || !ground || !anchor || !config) return null;
  const width = Number(targetWidth);
  if (Number.isFinite(width)) model.setTargetWidth(width);
  const position = createGroundPosition(ground, anchor, {
    offset,
    lift: config.lift,
  });
  model.placeAt(position, yaw);
  const rotation = config.rotation ?? {};
  model.group.rotation.x = Number(rotation.x) || 0;
  model.group.rotation.y += Number(rotation.y) || 0;
  model.group.rotation.z = Number(rotation.z) || 0;
  alignRotatedBaseToY(model.group, position.y, rotation);
  if (parent) parent.add(model.group);
  return position;
}

export function placeModelPropInstances({
  model,
  propId,
  config,
  name,
  ground,
  world,
}) {
  if (!model || !config || !ground || !world) return [];
  const instanceName = name ?? config.modelName ?? propId;
  return getModelPropSpots(ground, propId).map((spot, index) => {
    const instance = model.clone?.() ?? model.group.clone(true);
    instance.name = `${instanceName} ${index + 1}`;
    const position = createGroundPosition(ground, spot, { lift: config.lift });
    instance.position.set(position.x, position.y, position.z);
    const rotation = config.rotation ?? {};
    instance.rotation.set(
      numberOrZero(rotation.x),
      spot.yaw
        + (numberOrZero(config.yaw) + numberOrZero(config.yawOffset)) * Math.PI / 180
        + numberOrZero(rotation.y),
      numberOrZero(rotation.z),
    );
    alignRotatedBaseToY(instance, position.y, rotation);
    world.add(instance);
    return instance;
  });
}
