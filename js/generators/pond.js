import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { PERFORMANCE, SEASONS } from '../config/index.js';
import { SeededRandom } from '../utils/random.js';

const TAU = Math.PI * 2;

function smoothstep(minimum, maximum, value) {
  const normalized = THREE.MathUtils.clamp(
    (value - minimum) / Math.max(0.0001, maximum - minimum),
    0,
    1,
  );
  return normalized * normalized * (3 - 2 * normalized);
}

function createFlatNormalTexture() {
  const data = new Uint8Array([128, 255, 128, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.name = 'Temporary flat pond normal';
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

class PondRippleSimulation {
  constructor(profile, size = 128) {
    this.profile = profile;
    this.size = size;
    this.height = new Float32Array(size * size);
    this.velocity = new Float32Array(size * size);
    this.laplacian = new Float32Array(size * size);
    this.mask = new Uint8Array(size * size);
    this.boundaryDamping = new Float32Array(size * size);
    this.shoreDepth = new Float32Array(size * size);
    this.normalData = new Uint8Array(size * size * 4);
    this.accumulator = 0;
    this.cosine = Math.cos(profile.rotation);
    this.sine = Math.sin(profile.rotation);
    this.halfSizeX = profile.surfaceRadiusX ?? profile.radiusX;
    this.halfSizeZ = profile.surfaceRadiusZ ?? profile.radiusZ;
    const cellSizeX = this.halfSizeX * 2 / (size - 1);
    const cellSizeZ = this.halfSizeZ * 2 / (size - 1);
    const inverseX = 1 / (cellSizeX * cellSizeX);
    const inverseZ = 1 / (cellSizeZ * cellSizeZ);
    const inverseTotal = inverseX + inverseZ;
    this.waveWeightX = inverseX / inverseTotal * 2;
    this.waveWeightZ = inverseZ / inverseTotal * 2;

    for (let y = 0; y < size; y += 1) {
      const localZ = (y / (size - 1) * 2 - 1) * this.halfSizeZ;
      for (let x = 0; x < size; x += 1) {
        const localX = (x / (size - 1) * 2 - 1) * this.halfSizeX;
        const worldX = profile.center.x
          + localX * this.cosine
          - localZ * this.sine;
        const worldZ = profile.center.z
          + localX * this.sine
          + localZ * this.cosine;
        const index = y * size + x;
        const shoreDepth = -profile.signedDistance(worldX, worldZ);
        this.shoreDepth[index] = shoreDepth;
        if (shoreDepth <= 0.012) continue;
        this.mask[index] = 1;
        this.boundaryDamping[index] = THREE.MathUtils.lerp(
          0.925,
          0.995,
          smoothstep(0.012, 0.28, shoreDepth),
        );
      }
    }

    this.texture = new THREE.DataTexture(
      this.normalData,
      size,
      size,
      THREE.RGBAFormat,
    );
    this.texture.name = 'Dynamic pond surface-tension normals';
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.writeNormals();
  }

  worldToGrid(x, z) {
    const deltaX = x - this.profile.center.x;
    const deltaZ = z - this.profile.center.z;
    const localX = deltaX * this.cosine + deltaZ * this.sine;
    const localZ = -deltaX * this.sine + deltaZ * this.cosine;
    return {
      x: (localX / (this.halfSizeX * 2) + 0.5) * (this.size - 1),
      y: (localZ / (this.halfSizeZ * 2) + 0.5) * (this.size - 1),
    };
  }

  addRipple(x, z, strength = 0.018, radius = 0.16) {
    const center = this.worldToGrid(x, z);
    const cellRadiusX = Math.max(
      1.5,
      radius / (this.halfSizeX * 2) * this.size,
    );
    const cellRadiusY = Math.max(
      1.5,
      radius / (this.halfSizeZ * 2) * this.size,
    );
    const minimumX = Math.max(1, Math.floor(center.x - cellRadiusX * 2));
    const maximumX = Math.min(this.size - 2, Math.ceil(center.x + cellRadiusX * 2));
    const minimumY = Math.max(1, Math.floor(center.y - cellRadiusY * 2));
    const maximumY = Math.min(this.size - 2, Math.ceil(center.y + cellRadiusY * 2));

    for (let gridY = minimumY; gridY <= maximumY; gridY += 1) {
      for (let gridX = minimumX; gridX <= maximumX; gridX += 1) {
        const index = gridY * this.size + gridX;
        if (!this.mask[index]) continue;
        const distance = Math.hypot(
          (gridX - center.x) / cellRadiusX,
          (gridY - center.y) / cellRadiusY,
        );
        if (distance >= 2) continue;
        const impulse = Math.exp(-distance * distance * 2.2) * strength;
        this.velocity[index] += impulse;
        this.height[index] -= impulse * 0.34;
      }
    }
  }

  step() {
    const size = this.size;
    const height = this.height;
    const laplacian = this.laplacian;

    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const index = y * size + x;
        if (!this.mask[index]) {
          laplacian[index] = 0;
          continue;
        }
        laplacian[index] = (
          height[index - 1] + height[index + 1] - height[index] * 2
        ) * this.waveWeightX + (
          height[index - size] + height[index + size] - height[index] * 2
        ) * this.waveWeightZ;
      }
    }

    for (let y = 2; y < size - 2; y += 1) {
      for (let x = 2; x < size - 2; x += 1) {
        const index = y * size + x;
        if (!this.mask[index]) continue;
        const curvature = laplacian[index];
        const curvatureSpread = laplacian[index - 1]
          + laplacian[index + 1]
          + laplacian[index - size]
          + laplacian[index + size]
          - curvature * 4;
        const acceleration = curvature * 0.19 - curvatureSpread * 0.006;
        const damping = this.boundaryDamping[index];
        this.velocity[index] = THREE.MathUtils.clamp(
          (this.velocity[index] + acceleration) * damping,
          -0.085,
          0.085,
        );
        height[index] = THREE.MathUtils.clamp(
          (height[index] + this.velocity[index]) * 0.9992,
          -0.11,
          0.11,
        );
      }
    }
  }

  update(delta) {
    this.accumulator += Math.min(delta, 0.05);
    const stepDuration = 1 / 60;
    let steps = 0;
    while (this.accumulator >= stepDuration && steps < 3) {
      this.step();
      this.accumulator -= stepDuration;
      steps += 1;
    }
    if (steps > 0) this.writeNormals();
  }

  writeNormals() {
    const size = this.size;
    const normal = new THREE.Vector3();
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = y * size + x;
        const offset = index * 4;
        if (!this.mask[index]) {
          this.normalData[offset] = 128;
          this.normalData[offset + 1] = 255;
          this.normalData[offset + 2] = 128;
          this.normalData[offset + 3] = Math.round(
            THREE.MathUtils.clamp((this.shoreDepth[index] + 0.2) / 0.8, 0, 1) * 255,
          );
          continue;
        }
        const left = this.height[index - (x > 0 ? 1 : 0)];
        const right = this.height[index + (x < size - 1 ? 1 : 0)];
        const down = this.height[index - (y > 0 ? size : 0)];
        const up = this.height[index + (y < size - 1 ? size : 0)];
        const scaleX = (size - 1) / (this.halfSizeX * 2);
        const scaleZ = (size - 1) / (this.halfSizeZ * 2);
        normal.set(
          -(right - left) * scaleX * 0.72,
          1,
          -(up - down) * scaleZ * 0.72,
        ).normalize();
        this.normalData[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
        this.normalData[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
        this.normalData[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
        this.normalData[offset + 3] = Math.round(
          THREE.MathUtils.clamp((this.shoreDepth[index] + 0.2) / 0.8, 0, 1) * 255,
        );
      }
    }
    this.texture.needsUpdate = true;
  }

  sampleHeight(x, z) {
    const point = this.worldToGrid(x, z);
    const gridX = THREE.MathUtils.clamp(point.x, 0, this.size - 1);
    const gridY = THREE.MathUtils.clamp(point.y, 0, this.size - 1);
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const x1 = Math.min(this.size - 1, x0 + 1);
    const y1 = Math.min(this.size - 1, y0 + 1);
    const blendX = gridX - x0;
    const blendY = gridY - y0;
    const lower = THREE.MathUtils.lerp(
      this.height[y0 * this.size + x0],
      this.height[y0 * this.size + x1],
      blendX,
    );
    const upper = THREE.MathUtils.lerp(
      this.height[y1 * this.size + x0],
      this.height[y1 * this.size + x1],
      blendX,
    );
    return THREE.MathUtils.lerp(lower, upper, blendY);
  }

  dispose() {
    this.texture.dispose();
  }
}

export function createPondProfile({
  seed = 'ancient-oak',
  rawHeightAt = () => 0.15,
} = {}) {
  const random = new SeededRandom(`${seed}:woodland-pond-profile`);
  const center = Object.freeze({
    x: 8.65 + random.signed(0.34),
    z: -5.55 + random.signed(0.38),
  });
  const radiusX = random.range(3.85, 4.35);
  const radiusZ = random.range(2.55, 2.95);
  const rotation = THREE.MathUtils.degToRad(random.range(-17, 7));
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const harmonics = Object.freeze([
    { frequency: 2, amplitude: random.range(0.045, 0.09), phase: random.range(0, TAU) },
    { frequency: 3, amplitude: random.range(0.035, 0.075), phase: random.range(0, TAU) },
    { frequency: 5, amplitude: random.range(0.018, 0.045), phase: random.range(0, TAU) },
    { frequency: 7, amplitude: random.range(0.012, 0.032), phase: random.range(0, TAU) },
  ]);

  const radiusFactorAt = (angle) => harmonics.reduce(
    (factor, harmonic) => (
      factor + Math.sin(angle * harmonic.frequency + harmonic.phase) * harmonic.amplitude
    ),
    1,
  );
  let maximumRadiusFactor = 1;
  for (let index = 0; index < 96; index += 1) {
    maximumRadiusFactor = Math.max(
      maximumRadiusFactor,
      radiusFactorAt(index / 96 * TAU),
    );
  }
  const surfaceRadiusX = radiusX * maximumRadiusFactor + 0.16;
  const surfaceRadiusZ = radiusZ * maximumRadiusFactor + 0.16;

  const toLocal = (x, z) => {
    const deltaX = x - center.x;
    const deltaZ = z - center.z;
    return {
      x: deltaX * cosine + deltaZ * sine,
      z: -deltaX * sine + deltaZ * cosine,
    };
  };

  const pointAt = (angle, inset = 0) => {
    const factor = Math.max(0.72, radiusFactorAt(angle));
    const localX = Math.cos(angle) * Math.max(0.2, radiusX * factor - inset);
    const localZ = Math.sin(angle) * Math.max(0.2, radiusZ * factor - inset);
    return {
      x: center.x + localX * cosine - localZ * sine,
      z: center.z + localX * sine + localZ * cosine,
      localX,
      localZ,
    };
  };

  const signedDistance = (x, z) => {
    const local = toLocal(x, z);
    const angle = Math.atan2(local.z / radiusZ, local.x / radiusX);
    const factor = Math.max(0.72, radiusFactorAt(angle));
    const normalizedRadius = Math.hypot(
      local.x / (radiusX * factor),
      local.z / (radiusZ * factor),
    );
    return (normalizedRadius - 1) * Math.min(radiusX, radiusZ) * factor;
  };

  let shorelineHeight = 0;
  const shorelineSamples = 36;
  for (let index = 0; index < shorelineSamples; index += 1) {
    const point = pointAt(index / shorelineSamples * TAU, 0);
    shorelineHeight += rawHeightAt(point.x, point.z);
  }
  const waterLevel = shorelineHeight / shorelineSamples - 0.055;

  const contains = (x, z, padding = 0) => signedDistance(x, z) < padding;
  const shapeTerrain = (x, z, sourceHeight) => {
    const distance = signedDistance(x, z);
    if (distance >= 1.35) return sourceHeight;
    const depth = smoothstep(0, Math.min(radiusX, radiusZ) * 0.86, -distance);
    const basinHeight = waterLevel + 0.025
      - depth * 0.58
      + Math.max(0, distance) * 0.13;
    const influence = 1 - smoothstep(0.2, 1.35, distance);
    return THREE.MathUtils.lerp(sourceHeight, basinHeight, influence);
  };

  const localOffsetToWorld = (localX, localZ) => ({
    x: center.x + localX * cosine - localZ * sine,
    z: center.z + localX * sine + localZ * cosine,
  });
  const exclusionRadius = radiusZ * 0.9;
  const exclusionZones = [-1, 0, 1].map((index) => {
    const point = localOffsetToWorld(index * radiusX * 0.45, 0);
    return Object.freeze({ ...point, radius: exclusionRadius });
  });

  return Object.freeze({
    center,
    radiusX,
    radiusZ,
    surfaceRadiusX,
    surfaceRadiusZ,
    rotation,
    waterLevel,
    signedDistance,
    contains,
    pointAt,
    shapeTerrain,
    exclusionZones: Object.freeze(exclusionZones),
  });
}

export function createPondFeatures({
  profile,
  seed = 'ancient-oak',
  season = 'summer',
  quality = 'high',
  heightAt = () => 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'Procedural woodland pond shoreline';
  const random = new SeededRandom(`${seed}:woodland-pond-shore`);

  const stoneCount = quality === 'high' ? 46 : 25;
  const stoneGeometry = new THREE.IcosahedronGeometry(1, quality === 'high' ? 1 : 0);
  const stoneMaterial = new THREE.MeshStandardMaterial({
    name: 'Damp pond edge stones',
    color: season === 'autumn' ? '#655f50' : '#59665a',
    roughness: 0.93,
    metalness: 0,
  });
  const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stoneCount);
  const dummy = new THREE.Object3D();
  const shorelineRockFootprints = [];
  const shorelineRockAnchors = [];
  const containsFootprint = (footprint, pointX, pointZ, padding) => {
    if (Number.isFinite(footprint.radius)) {
      return Math.hypot(pointX - footprint.x, pointZ - footprint.z)
        <= footprint.radius + padding;
    }
    const deltaX = pointX - footprint.x;
    const deltaZ = pointZ - footprint.z;
    const localX = deltaX * footprint.cosine + deltaZ * footprint.sine;
    const localZ = -deltaX * footprint.sine + deltaZ * footprint.cosine;
    const radiusX = Math.max(0.001, footprint.radiusX + padding);
    const radiusZ = Math.max(0.001, footprint.radiusZ + padding);
    return (localX * localX) / (radiusX * radiusX)
      + (localZ * localZ) / (radiusZ * radiusZ) <= 1;
  };
  const containsShorelineRock = (pointX, pointZ, padding = 0) => (
    shorelineRockFootprints.some((footprint) => (
      containsFootprint(footprint, pointX, pointZ, padding)
    ))
  );
  for (let index = 0; index < stoneCount; index += 1) {
    const angle = index / stoneCount * TAU + random.signed(0.075);
    const point = profile.pointAt(angle, random.range(-0.28, 0.08));
    const scale = random.range(0.11, 0.34) * (random.chance(0.12) ? 1.45 : 1);
    const tiltX = random.signed(0.16);
    const yaw = random.range(0, TAU);
    const tiltZ = random.signed(0.16);
    const scaleX = scale * random.range(0.8, 1.3);
    const scaleY = scale * random.range(0.35, 0.65);
    const scaleZ = scale;
    dummy.position.set(point.x, heightAt(point.x, point.z) + scale * 0.18, point.z);
    dummy.rotation.set(tiltX, yaw, tiltZ);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    stones.setMatrixAt(index, dummy.matrix);
    const footprint = Object.freeze({
      x: point.x,
      z: point.z,
      cosine: Math.cos(yaw),
      sine: Math.sin(yaw),
      radiusX: scaleX * 1.08,
      radiusZ: scaleZ * 1.08,
      radius: Math.max(scaleX, scaleZ) * 1.16,
    });
    shorelineRockFootprints.push(footprint);
    shorelineRockAnchors.push(Object.freeze({
      id: `pond-rock-${index}`,
      label: 'a pond rock',
      rockIndex: index,
      position: Object.freeze({
        x: point.x,
        // This is deliberately an upper bound. Climb sampling casts down to the real mesh.
        y: dummy.position.y + Math.max(scaleX, scaleY, scaleZ),
        z: point.z,
      }),
      usableRadius: Math.min(scaleX, scaleZ),
      footprint,
    }));
  }
  stones.instanceMatrix.needsUpdate = true;
  stones.castShadow = true;
  stones.receiveShadow = true;
  stones.name = 'Irregular pond edge stones';
  group.add(stones);

  const reedCount = quality === 'high' ? 84 : 42;
  const reedGeometry = new THREE.CylinderGeometry(0.012, 0.024, 1, 5);
  reedGeometry.translate(0, 0.5, 0);
  const reedMaterial = new THREE.MeshStandardMaterial({
    name: 'Pond reeds',
    color: SEASONS[season]?.grass?.[0] ?? '#668b4c',
    roughness: 0.9,
  });
  const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, reedCount);
  let reedsPlaced = 0;
  let reedAttempts = 0;
  while (reedsPlaced < reedCount && reedAttempts < reedCount * 8) {
    reedAttempts += 1;
    const angle = random.range(0.08 * Math.PI, 1.55 * Math.PI);
    if (random.chance(0.32)) continue;
    const point = profile.pointAt(angle, random.range(-0.2, 0.18));
    const height = random.range(0.38, 0.92);
    const reedX = point.x + random.signed(0.16);
    const reedZ = point.z + random.signed(0.16);
    const tiltX = random.signed(0.035);
    const yaw = random.range(0, TAU);
    const tiltZ = random.signed(0.035);
    const scaleX = random.range(0.8, 1.15);
    const scaleZ = random.range(0.8, 1.15);
    if (containsShorelineRock(reedX, reedZ, 0.045)) continue;
    dummy.position.set(
      reedX,
      Math.max(profile.waterLevel - 0.07, heightAt(point.x, point.z)),
      reedZ,
    );
    dummy.rotation.set(tiltX, yaw, tiltZ);
    dummy.scale.set(scaleX, height, scaleZ);
    dummy.updateMatrix();
    reeds.setMatrixAt(reedsPlaced, dummy.matrix);
    reedsPlaced += 1;
  }
  reeds.count = reedsPlaced;
  reeds.instanceMatrix.needsUpdate = true;
  reeds.castShadow = false;
  reeds.receiveShadow = true;
  reeds.name = 'Sparse pond reeds';
  group.add(reeds);

  const padCount = quality === 'high' ? 17 : 9;
  const padGeometry = new THREE.CircleGeometry(0.18, 18, 0.18, TAU - 0.36);
  padGeometry.rotateX(-Math.PI / 2);
  const padMaterial = new THREE.MeshStandardMaterial({
    name: 'Small floating lily pads',
    color: season === 'autumn' ? '#687642' : '#517c43',
    roughness: 0.78,
    side: THREE.DoubleSide,
  });
  const pads = new THREE.InstancedMesh(padGeometry, padMaterial, padCount);
  let padsPlaced = 0;
  let padAttempts = 0;
  while (padsPlaced < padCount && padAttempts < padCount * 12) {
    padAttempts += 1;
    const x = profile.center.x + random.signed(profile.radiusX * 0.7);
    const z = profile.center.z + random.signed(profile.radiusZ * 0.7);
    if (!profile.contains(x, z, -0.42)) continue;
    const scale = random.range(0.55, 1.15);
    dummy.position.set(x, profile.waterLevel + 0.018, z);
    dummy.rotation.set(0, random.range(0, TAU), random.signed(0.025));
    dummy.scale.set(scale * random.range(0.82, 1.18), 1, scale);
    dummy.updateMatrix();
    pads.setMatrixAt(padsPlaced, dummy.matrix);
    padsPlaced += 1;
  }
  pads.count = padsPlaced;
  pads.instanceMatrix.needsUpdate = true;
  pads.castShadow = false;
  pads.receiveShadow = true;
  pads.name = 'Floating lily pads';
  group.add(pads);

  const draggablePoint = profile.pointAt(1.15, -0.52);
  const draggableRadius = 0.48;
  const draggableGeometry = new THREE.IcosahedronGeometry(1, 2);
  const draggableMaterial = new THREE.MeshStandardMaterial({
    name: 'Interactive pond stone',
    color: season === 'autumn' ? '#625c50' : '#4f5e57',
    roughness: 0.86,
    metalness: 0.02,
  });
  const draggableStone = new THREE.Mesh(draggableGeometry, draggableMaterial);
  draggableStone.position.set(
    draggablePoint.x,
    heightAt(draggablePoint.x, draggablePoint.z) + draggableRadius * 0.26,
    draggablePoint.z,
  );
  draggableStone.rotation.set(0.12, random.range(0, TAU), -0.08);
  draggableStone.scale.set(draggableRadius * 1.18, draggableRadius * 0.72, draggableRadius);
  draggableStone.castShadow = true;
  draggableStone.receiveShadow = true;
  draggableStone.name = 'Draggable pond ripple stone';
  draggableStone.userData.draggablePondStone = true;
  draggableStone.userData.radius = draggableRadius;
  draggableStone.userData.sinking = false;
  draggableStone.userData.settledInPond = false;
  const containsGroundPoint = (pointX, pointZ, padding = 0) => {
    if (containsShorelineRock(pointX, pointZ, padding)) return true;
    if (draggableStone.userData.sinking || draggableStone.userData.settledInPond) return false;
    const yaw = draggableStone.rotation.y;
    return containsFootprint({
      x: draggableStone.position.x,
      z: draggableStone.position.z,
      cosine: Math.cos(yaw),
      sine: Math.sin(yaw),
      radiusX: Math.abs(draggableStone.scale.x) * 1.08,
      radiusZ: Math.abs(draggableStone.scale.z) * 1.08,
      radius: Math.max(
        Math.abs(draggableStone.scale.x),
        Math.abs(draggableStone.scale.z),
      ) * 1.16,
    }, pointX, pointZ, padding);
  };
  group.userData.shorelineRockFootprints = shorelineRockFootprints;
  group.userData.shorelineRockAnchors = Object.freeze(shorelineRockAnchors);
  group.userData.shorelineRockSurfaceMesh = stones;
  group.userData.containsGroundPoint = containsGroundPoint;
  group.userData.interactiveStone = draggableStone;
  group.add(draggableStone);

  return group;
}

function createWaterShape(profile, quality = 'high') {
  const segments = quality === 'high' ? 96 : 72;
  const rings = quality === 'high' ? 24 : 18;
  const vertexCount = 1 + segments * rings;
  const positions = new Float32Array(vertexCount * 3);
  const surfaceSamples = new Float32Array(vertexCount * 3);
  surfaceSamples[0] = profile.center.x;
  surfaceSamples[1] = profile.center.z;
  surfaceSamples[2] = -profile.signedDistance(profile.center.x, profile.center.z);

  let vertex = 1;
  for (let ring = 1; ring <= rings; ring += 1) {
    const radialScale = ring / rings;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * TAU;
      const edge = profile.pointAt(angle, -0.11);
      const worldX = profile.center.x + (edge.x - profile.center.x) * radialScale;
      const worldZ = profile.center.z + (edge.z - profile.center.z) * radialScale;
      const offset = vertex * 3;
      positions[offset] = worldX - profile.center.x;
      positions[offset + 1] = -(worldZ - profile.center.z);
      positions[offset + 2] = 0;
      surfaceSamples[offset] = worldX;
      surfaceSamples[offset + 1] = worldZ;
      surfaceSamples[offset + 2] = -profile.signedDistance(worldX, worldZ);
      vertex += 1;
    }
  }

  const indices = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const current = 1 + segment;
    const next = 1 + (segment + 1) % segments;
    indices.push(0, next, current);
  }
  for (let ring = 2; ring <= rings; ring += 1) {
    const innerStart = 1 + (ring - 2) * segments;
    const outerStart = 1 + (ring - 1) * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const nextSegment = (segment + 1) % segments;
      const inner = innerStart + segment;
      const innerNext = innerStart + nextSegment;
      const outer = outerStart + segment;
      const outerNext = outerStart + nextSegment;
      indices.push(inner, innerNext, outerNext, inner, outerNext, outer);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'Subdivided dynamic pond surface';
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 0.18;
  geometry.userData.surfaceSamples = surfaceSamples;
  return geometry;
}

export class PondWater {
  constructor(renderer, scene, sunDirection) {
    this.sunDirection = sunDirection;
    this.normalTexture = createFlatNormalTexture();
    this.simulation = null;
    this.profile = null;
    this.ambientTimer = 0;
    this.ambientPhase = 0;
    this.shoreSplashCooldown = 0;
    this.rippleUpdateAccumulator = 0;
    this.shoreProbes = [];
    this.splashEffects = [];
    this.splashRingGeometry = new THREE.RingGeometry(0.82, 1, 40);
    this.disposed = false;
    this.reflectionsEnabled = true;
    this.ripplesEnabled = true;
    this.lastReflectionUpdate = -Infinity;
    this.water = new Water(new THREE.CircleGeometry(0.1, 8), {
      textureWidth: 384,
      textureHeight: 384,
      clipBias: 0.002,
      alpha: 0.93,
      waterNormals: this.normalTexture,
      sunDirection,
      sunColor: '#fff1cf',
      waterColor: '#244d47',
      distortionScale: 1.15,
      fog: Boolean(scene.fog),
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.renderOrder = 2;
    this.water.name = 'Reflective procedural pond water';
    this.water.material.transparent = true;
    this.water.material.depthWrite = true;
    this.water.receiveShadow = true;
    this.water.userData.isPondWater = true;
    this.splashGroup = new THREE.Group();
    this.splashGroup.name = 'Transient pond impact splashes';
    this.splashGroup.renderOrder = 4;
    this.water.add(this.splashGroup);
    const renderReflection = this.water.onBeforeRender;
    this.water.onBeforeRender = (...args) => {
      if (!this.reflectionsEnabled) return;
      if (PERFORMANCE.reflectionUpdateInterval > 0) {
        const now = performance.now() / 1000;
        if (now - this.lastReflectionUpdate < PERFORMANCE.reflectionUpdateInterval) return;
        this.lastReflectionUpdate = now;
      }
      renderReflection(...args);
    };
    this.patchWaterShader();
  }

  patchWaterShader() {
    const material = this.water.material;
    material.uniforms.uPondCenter = { value: new THREE.Vector2() };
    material.uniforms.uPondHalfSize = { value: new THREE.Vector2(1, 1) };
    material.uniforms.uPondRotation = { value: 0 };
    material.uniforms.uShoreTime = { value: 0 };
    material.uniforms.uShoreActivity = { value: 0.35 };
    material.fragmentShader = material.fragmentShader.replace(
      'uniform vec3 waterColor;',
      `uniform vec3 waterColor;
      uniform vec2 uPondCenter;
      uniform vec2 uPondHalfSize;
      uniform float uPondRotation;
      uniform float uShoreTime;
      uniform float uShoreActivity;`,
    );
    material.fragmentShader = material.fragmentShader.replace(
      /vec4 getNoise\( vec2 uv \) \{[\s\S]*?return noise \* 0\.5 - 1\.0;\s*\}/,
      `vec2 getPondUv(vec2 worldXZ) {
        vec2 delta = worldXZ - uPondCenter;
        float cosine = cos(uPondRotation);
        float sine = sin(uPondRotation);
        vec2 localPosition = vec2(
          delta.x * cosine + delta.y * sine,
          -delta.x * sine + delta.y * cosine
        );
        return localPosition / (uPondHalfSize * 2.0) + 0.5;
      }

      vec3 getPondNormal(vec2 worldXZ) {
        vec3 encodedNormal = texture2D(normalSampler, getPondUv(worldXZ)).xyz * 2.0 - 1.0;
        float cosine = cos(uPondRotation);
        float sine = sin(uPondRotation);
        vec2 worldNormalXZ = vec2(
          encodedNormal.x * cosine - encodedNormal.z * sine,
          encodedNormal.x * sine + encodedNormal.z * cosine
        );
        return normalize(vec3(worldNormalXZ.x, max(0.08, encodedNormal.y), worldNormalXZ.y));
      }

      float getPondShoreDepth(vec2 worldXZ) {
        float encodedDepth = texture2D(normalSampler, getPondUv(worldXZ)).a;
        return encodedDepth * 0.8 - 0.2;
      }`,
    );
    material.fragmentShader = material.fragmentShader.replace(
      /vec4 noise = getNoise\(\s*worldPosition\.xz \* size\s*\);\s*vec3 surfaceNormal = normalize\(\s*noise\.xzy \* vec3\(\s*1\.5,\s*1\.0,\s*1\.5\s*\)\s*\);/,
      'vec3 surfaceNormal = getPondNormal(worldPosition.xz);',
    );
    material.fragmentShader = material.fragmentShader.replace(
      /vec3 outgoingLight = albedo;\s*gl_FragColor = vec4\( outgoingLight, alpha \);/,
      `vec3 outgoingLight = albedo;
      float shoreDepth = getPondShoreDepth(worldPosition.xz);
      float slowLap = sin(uShoreTime * 0.78 + worldPosition.x * 0.76 + worldPosition.z * 0.51);
      float crossingLap = sin(uShoreTime * 1.17 - worldPosition.x * 0.39 + worldPosition.z * 0.92);
      float lapFront = -0.034 + (slowLap * 0.68 + crossingLap * 0.32)
        * mix(0.009, 0.032, uShoreActivity);
      float waterCoverage = smoothstep(lapFront - 0.022, lapFront + 0.045, shoreDepth);
      if (waterCoverage < 0.012) discard;
      float edgeDistance = abs(shoreDepth - lapFront);
      float wetEdge = (1.0 - smoothstep(0.018, 0.16, edgeDistance)) * waterCoverage;
      float edgeShimmer = 0.58 + 0.42 * sin(
        uShoreTime * 2.7 + worldPosition.x * 2.2 - worldPosition.z * 1.65
      );
      float edgeHighlight = (1.0 - smoothstep(0.0, 0.075, edgeDistance))
        * (0.12 + edgeShimmer * mix(0.08, 0.18, uShoreActivity));
      outgoingLight = mix(outgoingLight, waterColor * 0.68, wetEdge * 0.16);
      outgoingLight = mix(outgoingLight, mix(waterColor, sunColor, 0.32), edgeHighlight);
      gl_FragColor = vec4(outgoingLight, alpha * waterCoverage);`,
    );
    material.customProgramCacheKey = () => 'arborium-dynamic-pond-water-v2';
    material.needsUpdate = true;
  }

  configure(profile, season = 'summer', quality = 'high') {
    this.clearSplashes();
    this.water.geometry.dispose();
    this.water.geometry = createWaterShape(profile, quality);
    this.water.position.set(profile.center.x, profile.waterLevel, profile.center.z);
    this.profile = profile;
    this.simulation?.dispose();
    this.simulation = new PondRippleSimulation(
      profile,
      PERFORMANCE.pondRippleSimulationSize,
    );
    if (this.normalTexture) {
      this.normalTexture.dispose();
      this.normalTexture = null;
    }
    const colors = {
      spring: '#285a50',
      summer: '#214f49',
      autumn: '#3f5146',
      winter: '#35575a',
    };
    this.water.material.uniforms.waterColor.value.set(colors[season] ?? colors.summer);
    this.water.material.uniforms.sunDirection.value = this.sunDirection;
    this.water.material.uniforms.normalSampler.value = this.simulation.texture;
    this.water.material.uniforms.uPondCenter.value.set(profile.center.x, profile.center.z);
    this.water.material.uniforms.uPondHalfSize.value.set(
      profile.surfaceRadiusX ?? profile.radiusX,
      profile.surfaceRadiusZ ?? profile.radiusZ,
    );
    this.water.material.uniforms.uPondRotation.value = profile.rotation;
    this.water.material.uniforms.uShoreTime.value = 0;
    this.ambientTimer = 0;
    this.ambientPhase = 0;
    this.shoreSplashCooldown = 0;
    this.rippleUpdateAccumulator = 0;
    this.lastReflectionUpdate = -Infinity;
    const shoreProbeCount = quality === 'high' ? 40 : 28;
    this.shoreProbes = Array.from({ length: shoreProbeCount }, (_, index) => {
      const point = profile.pointAt(index / shoreProbeCount * TAU, 0.15);
      return { x: point.x, z: point.z, previousHeight: 0 };
    });
    this.addRipple(profile.center.x, profile.center.z, 0.004, 0.34);
    this.water.material.needsUpdate = true;
    return this.water;
  }

  addRipple(x, z, strength = 0.018, radius = 0.16) {
    if (!this.ripplesEnabled) return false;
    if (!this.profile?.contains(x, z, -0.025)) return false;
    let rippleX = x;
    let rippleZ = z;
    const shoreDepth = -this.profile.signedDistance(x, z);
    if (shoreDepth < 0.16) {
      const deltaX = x - this.profile.center.x;
      const deltaZ = z - this.profile.center.z;
      const cosine = Math.cos(this.profile.rotation);
      const sine = Math.sin(this.profile.rotation);
      const localX = deltaX * cosine + deltaZ * sine;
      const localZ = -deltaX * sine + deltaZ * cosine;
      const angle = Math.atan2(
        localZ / this.profile.radiusZ,
        localX / this.profile.radiusX,
      );
      const inwardPoint = this.profile.pointAt(angle, 0.17);
      rippleX = inwardPoint.x;
      rippleZ = inwardPoint.z;
    }
    this.simulation?.addRipple(
      rippleX,
      rippleZ,
      shoreDepth < 0.16 ? strength * 1.12 : strength,
      radius,
    );
    return true;
  }

  createSplash(x, z, intensity = 1) {
    if (!this.profile?.contains(x, z, 0.04)) return false;
    const localCenter = this.worldToWaterLocal(x, z);
    const surfaceOffset = this.simulation?.sampleHeight(x, z) ?? 0;
    const ringMaterial = new THREE.MeshBasicMaterial({
      name: 'Pond splash expanding ring',
      color: '#c5ebe3',
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(this.splashRingGeometry, ringMaterial);
    ring.position.set(localCenter.x, localCenter.y, surfaceOffset + 0.018);
    ring.scale.setScalar(0.08);
    ring.renderOrder = 5;
    this.splashGroup.add(ring);

    const count = intensity >= 0.9 ? 14 : 9;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const phase = x * 1.731 + z * 2.417;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const angle = phase + index / count * TAU;
      const radialOffset = 0.018 + (index % 3) * 0.012;
      const radialSpeed = (0.13 + (index % 5) * 0.032) * intensity;
      positions[offset] = localCenter.x + Math.cos(angle) * radialOffset;
      positions[offset + 1] = localCenter.y - Math.sin(angle) * radialOffset;
      positions[offset + 2] = surfaceOffset + 0.025;
      velocities[offset] = Math.cos(angle) * radialSpeed;
      velocities[offset + 1] = -Math.sin(angle) * radialSpeed;
      velocities[offset + 2] = (0.48 + (index % 4) * 0.13) * intensity;
    }
    const dropletGeometry = new THREE.BufferGeometry();
    dropletGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dropletMaterial = new THREE.PointsMaterial({
      name: 'Pond impact spray droplets',
      color: '#d9f4ed',
      size: 0.075,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      toneMapped: false,
    });
    const droplets = new THREE.Points(dropletGeometry, dropletMaterial);
    droplets.renderOrder = 6;
    this.splashGroup.add(droplets);
    this.splashEffects.push({
      age: 0,
      duration: 0.82,
      ring,
      droplets,
      positions,
      velocities,
      intensity,
      worldX: x,
      worldZ: z,
    });
    return true;
  }

  worldToWaterLocal(x, z) {
    return {
      x: x - this.profile.center.x,
      y: -(z - this.profile.center.z),
    };
  }

  clearSplashes() {
    for (const effect of this.splashEffects) {
      effect.ring.removeFromParent();
      effect.ring.material.dispose();
      effect.droplets.removeFromParent();
      effect.droplets.geometry.dispose();
      effect.droplets.material.dispose();
    }
    this.splashEffects.length = 0;
  }

  updateSplashes(delta) {
    const step = Math.min(delta, 0.05);
    for (let effectIndex = this.splashEffects.length - 1; effectIndex >= 0; effectIndex -= 1) {
      const effect = this.splashEffects[effectIndex];
      effect.age += step;
      const progress = THREE.MathUtils.clamp(effect.age / effect.duration, 0, 1);
      const ringRadius = THREE.MathUtils.lerp(0.08, 0.72 * effect.intensity, progress);
      effect.ring.scale.setScalar(ringRadius);
      effect.ring.position.z = (this.simulation?.sampleHeight(
        effect.worldX,
        effect.worldZ,
      ) ?? 0) + 0.018;
      effect.ring.material.opacity = Math.pow(1 - progress, 1.55) * 0.68;
      for (let index = 0; index < effect.positions.length; index += 3) {
        effect.velocities[index + 2] -= 2.15 * step;
        effect.positions[index] += effect.velocities[index] * step;
        effect.positions[index + 1] += effect.velocities[index + 1] * step;
        effect.positions[index + 2] += effect.velocities[index + 2] * step;
      }
      effect.droplets.geometry.attributes.position.needsUpdate = true;
      effect.droplets.material.opacity = Math.pow(1 - progress, 0.8) * 0.86;
      if (progress < 1) continue;
      effect.ring.removeFromParent();
      effect.ring.material.dispose();
      effect.droplets.removeFromParent();
      effect.droplets.geometry.dispose();
      effect.droplets.material.dispose();
      this.splashEffects.splice(effectIndex, 1);
    }
  }

  updateSurfaceGeometry(elapsed, windStrength) {
    const geometry = this.water.geometry;
    const positions = geometry.attributes.position;
    const samples = geometry.userData.surfaceSamples;
    if (!positions || !samples || !this.simulation) return;
    const verticalRange = THREE.MathUtils.lerp(0.006, 0.021, windStrength);
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const offset = vertex * 3;
      const worldX = samples[offset];
      const worldZ = samples[offset + 1];
      const shoreDepth = samples[offset + 2];
      const shoreInfluence = 1 - smoothstep(-0.12, 0.58, shoreDepth);
      const slowLap = Math.sin(elapsed * 0.78 + worldX * 0.76 + worldZ * 0.51);
      const crossingLap = Math.sin(elapsed * 1.17 - worldX * 0.39 + worldZ * 0.92);
      const verticalLap = (slowLap * 0.68 + crossingLap * 0.32)
        * verticalRange * shoreInfluence;
      positions.array[offset + 2] = this.simulation.sampleHeight(worldX, worldZ) + verticalLap;
    }
    positions.needsUpdate = true;
  }

  updateShoreSplashes(delta) {
    if (!this.simulation || this.shoreProbes.length === 0) return;
    this.shoreSplashCooldown = Math.max(0, this.shoreSplashCooldown - delta);
    const safeDelta = Math.max(delta, 1 / 120);
    for (const probe of this.shoreProbes) {
      const height = this.simulation.sampleHeight(probe.x, probe.z);
      const riseSpeed = (height - probe.previousHeight) / safeDelta;
      probe.previousHeight = height;
      if (
        this.shoreSplashCooldown <= 0
        && height > 0.018
        && riseSpeed > 0.055
      ) {
        this.createSplash(probe.x, probe.z, 0.38);
        this.shoreSplashCooldown = 0.24;
        break;
      }
    }
  }

  getSurfaceHeight(x, z) {
    if (!this.profile) return 0;
    return this.profile.waterLevel + (this.simulation?.sampleHeight(x, z) ?? 0);
  }

  update(delta, elapsed, windStrength = 0.35, sunColor = null) {
    const normalizedWind = THREE.MathUtils.clamp(windStrength, 0, 1);
    this.ambientTimer += delta * THREE.MathUtils.lerp(0.25, 1, normalizedWind);
    if (this.ripplesEnabled && this.profile && this.ambientTimer >= 1.15) {
      this.ambientTimer = 0;
      this.ambientPhase += 2.39996;
      const localX = Math.cos(this.ambientPhase) * this.profile.radiusX * 0.38;
      const localZ = Math.sin(this.ambientPhase) * this.profile.radiusZ * 0.38;
      const cosine = Math.cos(this.profile.rotation);
      const sine = Math.sin(this.profile.rotation);
      this.addRipple(
        this.profile.center.x + localX * cosine - localZ * sine,
        this.profile.center.z + localX * sine + localZ * cosine,
        THREE.MathUtils.lerp(0.0007, 0.0024, normalizedWind),
        0.28,
      );
    }
    if (this.ripplesEnabled) {
      if (PERFORMANCE.pondRippleUpdateInterval === 0) {
        this.simulation?.update(delta);
        this.updateSurfaceGeometry(elapsed, normalizedWind);
        this.updateShoreSplashes(delta);
      } else {
        this.rippleUpdateAccumulator += delta;
        if (this.rippleUpdateAccumulator >= PERFORMANCE.pondRippleUpdateInterval) {
          const rippleDelta = this.rippleUpdateAccumulator;
          this.rippleUpdateAccumulator %= PERFORMANCE.pondRippleUpdateInterval;
          this.simulation?.update(rippleDelta);
          this.updateSurfaceGeometry(elapsed, normalizedWind);
          this.updateShoreSplashes(rippleDelta);
        }
      }
    }
    this.updateSplashes(delta);
    this.water.material.uniforms.time.value = elapsed * THREE.MathUtils.lerp(
      0.16,
      0.34,
      normalizedWind,
    );
    this.water.material.uniforms.distortionScale.value = THREE.MathUtils.lerp(
      0.72,
      1.45,
      normalizedWind,
    );
    this.water.material.uniforms.uShoreTime.value = elapsed;
    this.water.material.uniforms.uShoreActivity.value = normalizedWind;
    if (sunColor) this.water.material.uniforms.sunColor.value.copy(sunColor);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearSplashes();
    this.simulation?.dispose();
    this.simulation = null;
    this.normalTexture?.dispose();
    this.normalTexture = null;
    this.splashRingGeometry.dispose();
    this.splashGroup.removeFromParent();
    this.water.removeFromParent();
    this.water.geometry.dispose();
    this.water.dispose();
    this.profile = null;
    this.shoreProbes = [];
  }
}
