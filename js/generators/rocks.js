import * as THREE from 'three';
import { DIORAMA } from '../config/index.js';
import { SeededRandom } from '../utils/random.js';
import { createNoise2D } from '../utils/noise.js';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const ROCK_PALETTES = {
  spring: ['#a49d91', '#918f89', '#b2a896', '#858681'],
  summer: ['#9b978f', '#aaa092', '#888986', '#b4a897'],
  autumn: ['#a0978a', '#b1a18e', '#8d8982', '#baa990'],
};

const MOSS_PALETTES = {
  spring: ['#78905a', '#8ba067', '#687e4e'],
  summer: ['#6d8251', '#81945e', '#607447'],
  autumn: ['#777a50', '#89865a', '#686e48'],
};

function createRockSurfaceTextures(random, quality) {
  if (typeof document === 'undefined') return { colorMap: null, bumpMap: null };
  const size = quality === 'high' ? 256 : 128;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  const bumpContext = bumpCanvas.getContext('2d');
  const colorImage = colorContext.createImageData(size, size);
  const bumpImage = bumpContext.createImageData(size, size);
  const stoneNoise = createNoise2D(`${random.seed}:stone-surface`);
  const poreNoise = createNoise2D(`${random.seed}:stone-pores`);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const broad = stoneNoise(u * 4.3, v * 4.3, 5);
      const fine = poreNoise(u * 29, v * 31, 3);
      const veinDistance = Math.abs(Math.sin(
        (u * 3.4 + v * 1.1 + broad * 0.24) * Math.PI,
      ));
      const vein = 1 - THREE.MathUtils.smoothstep(veinDistance, 0.025, 0.11);
      const value = THREE.MathUtils.clamp(242 + broad * 8 + fine * 4 - vein * 7, 222, 254);
      colorImage.data[index] = THREE.MathUtils.clamp(value + 2, 220, 255);
      colorImage.data[index + 1] = THREE.MathUtils.clamp(value, 218, 254);
      colorImage.data[index + 2] = THREE.MathUtils.clamp(value - 4, 212, 250);
      colorImage.data[index + 3] = 255;
      const bump = THREE.MathUtils.clamp(142 + broad * 31 + fine * 24 - vein * 10, 68, 214);
      bumpImage.data[index] = bump;
      bumpImage.data[index + 1] = bump;
      bumpImage.data[index + 2] = bump;
      bumpImage.data[index + 3] = 255;
    }
  }

  colorContext.putImageData(colorImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  colorMap.name = 'Subtle procedural stone color';
  bumpMap.name = 'Fine procedural stone relief';
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(1.35, 1.35);
  bumpMap.repeat.copy(colorMap.repeat);
  colorMap.anisotropy = quality === 'high' ? 8 : 4;
  bumpMap.anisotropy = quality === 'high' ? 8 : 4;
  return { colorMap, bumpMap };
}

function smoothSharedNormals(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const accumulated = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  const keyAt = (vertexIndex) => [
    Math.round(position.getX(vertexIndex) * 100000),
    Math.round(position.getY(vertexIndex) * 100000),
    Math.round(position.getZ(vertexIndex) * 100000),
  ].join(':');

  const entryCount = index ? index.count : position.count;
  for (let offset = 0; offset < entryCount; offset += 3) {
    const indices = index
      ? [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
      : [offset, offset + 1, offset + 2];
    a.fromBufferAttribute(position, indices[0]);
    b.fromBufferAttribute(position, indices[1]);
    c.fromBufferAttribute(position, indices[2]);
    edgeA.subVectors(b, a);
    edgeB.subVectors(c, a);
    faceNormal.crossVectors(edgeA, edgeB);

    for (const vertexIndex of indices) {
      const key = keyAt(vertexIndex);
      if (!accumulated.has(key)) accumulated.set(key, new THREE.Vector3());
      accumulated.get(key).add(faceNormal);
    }
  }

  const normals = new Float32Array(position.count * 3);
  const fallback = new THREE.Vector3();
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    const normal = accumulated.get(keyAt(vertexIndex));
    if (!normal || normal.lengthSq() < 0.0000001) {
      fallback.fromBufferAttribute(position, vertexIndex).normalize();
      normals[vertexIndex * 3] = fallback.x;
      normals[vertexIndex * 3 + 1] = fallback.y;
      normals[vertexIndex * 3 + 2] = fallback.z;
      continue;
    }
    normal.normalize();
    normals[vertexIndex * 3] = normal.x;
    normals[vertexIndex * 3 + 1] = normal.y;
    normals[vertexIndex * 3 + 2] = normal.z;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

function createRockGeometry(quality) {
  const geometry = new THREE.IcosahedronGeometry(1, quality === 'high' ? 2 : 1);
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    direction.copy(point).normalize();
    const distortion = 1
      + Math.sin(direction.x * 5.7 + direction.y * 2.9) * 0.075
      + Math.sin(direction.z * 7.1 - direction.x * 3.2) * 0.052
      + Math.sin((direction.x + direction.z) * 9.3) * 0.028;
    point.copy(direction).multiplyScalar(distortion);
    point.x *= 1.08;
    point.y *= 0.68;
    point.z *= 0.96;
    if (point.y < -0.46) point.y = -0.46 + (point.y + 0.46) * 0.16;
    position.setXYZ(index, point.x, point.y, point.z);
  }

  position.needsUpdate = true;
  smoothSharedNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'Shared irregular woodland rock';
  return geometry;
}

function createMossGeometry(rockGeometry) {
  const geometry = rockGeometry.clone();
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const bounds = geometry.boundingBox;
  const widthRange = Math.max(0.001, bounds.max.x - bounds.min.x);
  const depthRange = Math.max(0.001, bounds.max.z - bounds.min.z);
  const uvs = new Float32Array(position.count * 2);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    direction.fromBufferAttribute(normal, index).normalize();
    const originalX = point.x;
    const originalZ = point.z;
    point.addScaledVector(direction, 0.014);
    position.setXYZ(index, point.x, point.y, point.z);
    uvs[index * 2] = (originalX - bounds.min.x) / widthRange * 2.2;
    uvs[index * 2 + 1] = (originalZ - bounds.min.z) / depthRange * 2.2;
  }

  position.needsUpdate = true;
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'Continuous woodland moss shell';
  return geometry;
}

function addMossCoverage(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMossObjectPosition;
        varying vec3 vMossObjectNormal;
        varying vec2 vMossInstanceSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vMossObjectPosition = transformed;
        vMossObjectNormal = normalize(normal);
        #ifdef USE_INSTANCING
          vMossInstanceSeed = instanceMatrix[3].xz;
        #else
          vMossInstanceSeed = vec2(0.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vMossObjectPosition;
        varying vec3 vMossObjectNormal;
        varying vec2 vMossInstanceSeed;`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `float mossSeed = fract(sin(dot(vMossInstanceSeed, vec2(12.9898, 78.233))) * 43758.5453);
        float mossSeedB = fract(sin(dot(vMossInstanceSeed.yx + vec2(4.17), vec2(39.3468, 11.135))) * 24634.6345);
        float mossAngle = mossSeed * 6.2831853;
        vec2 mossPatchCenter = vec2(cos(mossAngle), sin(mossAngle)) * mix(0.08, 0.27, mossSeedB);
        float mossPatchRadius = mix(0.42, 0.68, fract(mossSeed * 9.73 + mossSeedB * 5.31));
        float mossBoundaryNoise = sin(vMossObjectPosition.x * 8.7 + vMossObjectPosition.z * 3.1) * 0.045
          + sin(vMossObjectPosition.z * 10.2 - vMossObjectPosition.x * 2.6) * 0.035;
        vec2 mossPatchDelta = (vMossObjectPosition.xz - mossPatchCenter) * vec2(1.0, 1.16);
        float mossPatchDistance = length(mossPatchDelta) + mossBoundaryNoise * 1.35;
        float mossPatchMask = 1.0 - smoothstep(
          mossPatchRadius - 0.08,
          mossPatchRadius + 0.055,
          mossPatchDistance
        );
        float mossHeightStart = mix(0.34, 0.43, mossSeedB);
        float mossHeightMask = smoothstep(
          mossHeightStart + mossBoundaryNoise,
          mossHeightStart + 0.14 + mossBoundaryNoise,
          vMossObjectPosition.y
        );
        float mossSlopeMask = smoothstep(0.28, 0.68, normalize(vMossObjectNormal).y);
        diffuseColor.a *= mossPatchMask * mossHeightMask * mossSlopeMask;
        #include <alphatest_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'partial-top-procedural-moss-v2';
}

function createMossTexture(random, quality) {
  const size = quality === 'high' ? 128 : 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const field = Math.sin(x * 0.19 + Math.sin(y * 0.08) * 2.1) * 0.42
        + Math.sin(y * 0.27 - x * 0.055) * 0.31
        + Math.sin((x + y) * 0.51) * 0.13
        + random.signed(0.12);
      const coverage = THREE.MathUtils.smoothstep(field, -0.38, 0.32);
      image.data[index] = THREE.MathUtils.clamp(239 + field * 11, 220, 252);
      image.data[index + 1] = THREE.MathUtils.clamp(245 + field * 9, 226, 255);
      image.data[index + 2] = THREE.MathUtils.clamp(230 + field * 12, 208, 248);
      image.data[index + 3] = Math.round(coverage * 255);
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Procedural mottled moss mask';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = quality === 'high' ? 8 : 4;
  return texture;
}

function finishInstances(mesh) {
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
  if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
}

function selectPropAnchor(placements, rockMesh, focusPoint, habitatSize) {
  if (placements.length === 0) return null;
  const targetDistance = habitatSize > DIORAMA.size ? 5.6 : 4.5;
  const broadPlacements = placements.filter((placement) => placement.usableRadius >= 0.45);
  const candidates = broadPlacements.length > 0 ? broadPlacements : placements;
  const candidate = [...candidates].sort((left, right) => {
    const score = (placement) => {
      const distance = Math.hypot(
        placement.position.x - focusPoint.x,
        placement.position.z - focusPoint.z,
      );
      const cameraSide = (
        placement.position.x - focusPoint.x
        + placement.position.z - focusPoint.z
      ) / Math.max(1, habitatSize);
      return placement.usableRadius * 5.2
        - Math.abs(distance - targetDistance) * 0.18
        + cameraSide * 0.42
        + (placement.hasMoss ? 0.04 : 0);
    };
    return score(right) - score(left);
  })[0];

  rockMesh.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.near = 0;
  raycaster.far = 6;
  const sampleRadius = Math.min(0.24, candidate.usableRadius * 0.38);
  const samples = [
    [0, 0],
    [sampleRadius, 0],
    [-sampleRadius, 0],
    [0, sampleRadius],
    [0, -sampleRadius],
  ];
  let supportY = Number.NEGATIVE_INFINITY;

  samples.forEach(([offsetX, offsetZ]) => {
    const origin = new THREE.Vector3(
      candidate.position.x + offsetX,
      candidate.position.y + 3,
      candidate.position.z + offsetZ,
    );
    raycaster.set(origin, DOWN);
    const hit = raycaster
      .intersectObject(rockMesh, false)
      .find((intersection) => intersection.instanceId === candidate.rockIndex);
    if (hit) supportY = Math.max(supportY, hit.point.y);
  });
  if (!Number.isFinite(supportY)) supportY = candidate.approximateTopY;

  return Object.freeze({
    rockIndex: candidate.rockIndex,
    position: Object.freeze({
      x: candidate.position.x,
      y: supportY,
      z: candidate.position.z,
    }),
    normal: Object.freeze({
      x: candidate.normal.x,
      y: candidate.normal.y,
      z: candidate.normal.z,
    }),
    yaw: candidate.yaw,
    usableRadius: candidate.usableRadius,
    hasMoss: candidate.hasMoss,
    footprint: Object.freeze({ ...candidate.footprint }),
  });
}

export function createRocks({
  seed = 'ancient-oak',
  season = 'summer',
  quality = 'high',
  heightAt = () => 0,
  habitatSize = DIORAMA.size,
  populationScale = 1,
  exclusionZones = [],
  placement = null,
} = {}) {
  const normalizedQuality = quality === 'low' ? 'low' : 'high';
  const normalizedSeason = ROCK_PALETTES[season] ? season : 'summer';
  const placementOptions = placement && typeof placement === 'object'
    ? placement
    : null;
  const requestedMinimumRadius = Number(placementOptions?.minRadius);
  const requestedMaximumRadius = Number(placementOptions?.maxRadius);
  const usesAnnulusPlacement = Number.isFinite(requestedMinimumRadius)
    && Number.isFinite(requestedMaximumRadius)
    && requestedMaximumRadius > requestedMinimumRadius;
  const minimumRadius = usesAnnulusPlacement
    ? Math.max(0, requestedMinimumRadius)
    : 0;
  const maximumRadius = usesAnnulusPlacement
    ? Math.max(minimumRadius + 0.1, requestedMaximumRadius)
    : 0;
  const variantSeedSalt = placementOptions?.seedSalt
    ?? placementOptions?.variantSeedSalt
    ?? '';
  const random = new SeededRandom(
    variantSeedSalt
      ? `${seed}:mossy-rocks:${String(variantSeedSalt)}`
      : `${seed}:mossy-rocks`,
  );
  const countBase = normalizedQuality === 'high' ? 26 : 15;
  const patchBase = normalizedQuality === 'high' ? 7 : 4;
  const defaultCount = Math.round(countBase * populationScale);
  const configuredCount = Number(
    placementOptions?.requestedCount ?? placementOptions?.count,
  );
  const requestedCount = usesAnnulusPlacement && Number.isFinite(configuredCount)
    ? Math.max(0, Math.round(configuredCount))
    : defaultCount;
  const configuredPatchCount = Number(placementOptions?.patchCount);
  const patchCount = usesAnnulusPlacement && Number.isFinite(configuredPatchCount)
    ? Math.max(0, Math.round(configuredPatchCount))
    : Math.round(patchBase * Math.sqrt(populationScale));
  const castShadow = placementOptions?.castShadow ?? true;
  const receiveShadow = placementOptions?.receiveShadow ?? true;
  const half = habitatSize * 0.45;
  const normalizedExclusionZones = Array.isArray(exclusionZones)
    ? exclusionZones.filter((zone) => (
      Number.isFinite(zone?.x)
      && Number.isFinite(zone?.z)
      && Number.isFinite(zone?.radius)
    ))
    : [];
  const intersectsExclusion = (x, z, extraRadius = 0) => (
    normalizedExclusionZones.some((zone) => (
      Math.hypot(x - zone.x, z - zone.z) < zone.radius + extraRadius
    ))
  );
  const rockGeometry = createRockGeometry(normalizedQuality);
  const mossGeometry = createMossGeometry(rockGeometry);
  const rockTextures = createRockSurfaceTextures(
    random.fork('rock-surface-textures'),
    normalizedQuality,
  );
  const mossTexture = createMossTexture(random.fork('moss-texture'), normalizedQuality);
  const rockMaterial = new THREE.MeshStandardMaterial({
    name: 'Warm weathered woodland stone',
    color: '#ffffff',
    map: rockTextures.colorMap,
    bumpMap: rockTextures.bumpMap,
    bumpScale: normalizedQuality === 'high' ? 0.045 : 0.032,
    roughness: 0.9,
    metalness: 0,
  });
  const mossMaterial = new THREE.MeshStandardMaterial({
    name: 'Top-facing woodland moss',
    color: '#ffffff',
    map: mossTexture,
    alphaTest: 0.25,
    alphaToCoverage: true,
    transparent: false,
    depthWrite: true,
    roughness: 1,
    metalness: 0,
    emissive: '#26301c',
    emissiveIntensity: 0.02,
    side: THREE.FrontSide,
  });
  addMossCoverage(mossMaterial);
  const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, requestedCount);
  const mossMesh = new THREE.InstancedMesh(mossGeometry, mossMaterial, requestedCount);
  const patches = [];
  const footprints = [];
  const placements = [];
  let patchAttempts = 0;

  const sampleAnnulusPoint = (sourceRandom, innerRadius, outerRadius) => {
    const angle = sourceRandom.range(0, TAU);
    const radius = Math.sqrt(THREE.MathUtils.lerp(
      innerRadius * innerRadius,
      outerRadius * outerRadius,
      sourceRandom.float(),
    ));
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    };
  };

  while (patches.length < patchCount && patchAttempts < patchCount * 20) {
    patchAttempts += 1;
    if (usesAnnulusPlacement) {
      const radius = random.range(0.55, 1.45);
      const innerRadius = minimumRadius + radius;
      const outerRadius = maximumRadius - radius;
      if (outerRadius <= innerRadius) continue;
      const point = sampleAnnulusPoint(random, innerRadius, outerRadius);
      if (intersectsExclusion(point.x, point.z, radius + 0.35)) continue;
      patches.push({ ...point, radius });
    } else {
      const x = random.range(-half * 0.82, half * 0.82);
      const z = random.range(-half * 0.82, half * 0.82);
      if (normalizedExclusionZones.length === 0 && Math.hypot(x, z) < 2.4) continue;
      if (intersectsExclusion(x, z, 0.85)) continue;
      patches.push({ x, z, radius: random.range(0.55, 1.45) });
    }
  }

  while (!usesAnnulusPlacement && patches.length < patchCount) {
    const angle = patches.length / patchCount * TAU + 0.37;
    const radius = half * 0.62;
    patches.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      radius: random.range(0.7, 1.25),
    });
  }

  const dummy = new THREE.Object3D();
  const rockPalette = ROCK_PALETTES[normalizedSeason];
  const mossPalette = MOSS_PALETTES[normalizedSeason];
  const color = new THREE.Color();
  const rockMinimumY = rockGeometry.boundingBox.min.y;
  const localRadiusX = Math.max(
    Math.abs(rockGeometry.boundingBox.min.x),
    Math.abs(rockGeometry.boundingBox.max.x),
  );
  const localRadiusZ = Math.max(
    Math.abs(rockGeometry.boundingBox.min.z),
    Math.abs(rockGeometry.boundingBox.max.z),
  );
  const terrainNormal = new THREE.Vector3();
  const tiltQuaternion = new THREE.Quaternion();
  const yawQuaternion = new THREE.Quaternion();
  const jitterQuaternion = new THREE.Quaternion();
  const jitterEuler = new THREE.Euler();
  let mossCount = 0;
  let placedCount = 0;

  for (let index = 0; index < requestedCount; index += 1) {
    const size = random.range(0.22, 0.68) * (random.chance(0.13) ? 1.38 : 1);
    const scaleX = size * random.range(0.82, 1.28);
    const scaleY = size * random.range(0.42, 0.7);
    const scaleZ = size * random.range(0.78, 1.22);
    const footprintRadiusX = scaleX * localRadiusX;
    const footprintRadiusZ = scaleZ * localRadiusZ;
    const horizontalExtent = Math.max(footprintRadiusX, footprintRadiusZ);
    const placementLimit = half - horizontalExtent - 0.12;
    let x;
    let z;
    let accepted = false;
    const isValidPlacement = (candidateX, candidateZ) => {
      if (usesAnnulusPlacement) {
        const radialDistance = Math.hypot(candidateX, candidateZ);
        return radialDistance >= minimumRadius + horizontalExtent
          && radialDistance <= maximumRadius - horizontalExtent
          && !intersectsExclusion(candidateX, candidateZ, horizontalExtent);
      }
      return Math.abs(candidateX) <= placementLimit
        && Math.abs(candidateZ) <= placementLimit
        && (
          normalizedExclusionZones.length > 0
          || Math.hypot(candidateX, candidateZ) > 1.85 + horizontalExtent * 0.35
        )
        && !intersectsExclusion(candidateX, candidateZ, horizontalExtent);
    };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (patches.length > 0 && random.chance(0.76)) {
        const patch = random.pick(patches);
        const angle = random.range(0, TAU);
        const radius = Math.sqrt(random.float()) * patch.radius;
        x = patch.x + Math.cos(angle) * radius;
        z = patch.z + Math.sin(angle) * radius;
      } else if (usesAnnulusPlacement) {
        const point = sampleAnnulusPoint(
          random,
          minimumRadius + horizontalExtent,
          maximumRadius - horizontalExtent,
        );
        x = point.x;
        z = point.z;
      } else {
        x = random.range(-half, half);
        z = random.range(-half, half);
      }
      if (isValidPlacement(x, z)) {
        accepted = true;
        break;
      }
    }

    if (!accepted && usesAnnulusPlacement) {
      for (let fallbackAttempt = 0; fallbackAttempt < 24; fallbackAttempt += 1) {
        const point = sampleAnnulusPoint(
          random,
          minimumRadius + horizontalExtent,
          maximumRadius - horizontalExtent,
        );
        x = point.x;
        z = point.z;
        if (isValidPlacement(x, z)) {
          accepted = true;
          break;
        }
      }
    } else if (!accepted) {
      for (let fallbackAttempt = 0; fallbackAttempt < 24; fallbackAttempt += 1) {
        const angle = index / Math.max(1, requestedCount) * TAU
          + fallbackAttempt * GOLDEN_ANGLE
          + random.signed(0.18);
        const radius = THREE.MathUtils.lerp(
          2.6,
          Math.max(2.8, placementLimit * 0.9),
          random.float(),
        );
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        if (isValidPlacement(x, z)) {
          accepted = true;
          break;
        }
      }
    }

    if (!accepted) continue;

    const slopeSample = Math.max(0.16, horizontalExtent * 0.55);
    const heightLeft = heightAt(x - slopeSample, z);
    const heightRight = heightAt(x + slopeSample, z);
    const heightBack = heightAt(x, z - slopeSample);
    const heightFront = heightAt(x, z + slopeSample);
    terrainNormal.set(
      heightLeft - heightRight,
      slopeSample * 2,
      heightBack - heightFront,
    ).normalize();
    const slopeSink = horizontalExtent
      * Math.hypot(terrainNormal.x, terrainNormal.z)
      * 0.18;
    tiltQuaternion.setFromUnitVectors(UP, terrainNormal);
    const yaw = random.range(0, TAU);
    yawQuaternion.setFromAxisAngle(UP, yaw);
    jitterEuler.set(random.signed(0.055), 0, random.signed(0.055));
    jitterQuaternion.setFromEuler(jitterEuler);
    dummy.position.set(
      x,
      heightAt(x, z)
        - rockMinimumY * scaleY
        - scaleY * random.range(0.055, 0.1)
        - slopeSink,
      z,
    );
    dummy.quaternion.copy(tiltQuaternion).multiply(yawQuaternion).multiply(jitterQuaternion);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    const footprint = {
      x,
      z,
      radiusX: footprintRadiusX,
      radiusZ: footprintRadiusZ,
      cosine: Math.cos(yaw),
      sine: Math.sin(yaw),
    };
    footprints.push(footprint);
    rockMesh.setMatrixAt(placedCount, dummy.matrix);
    color.set(random.pick(rockPalette));
    color.offsetHSL(random.signed(0.01), random.signed(0.018), random.signed(0.035));
    rockMesh.setColorAt(placedCount, color);

    const hasMoss = random.chance(0.54);
    if (hasMoss) {
      mossMesh.setMatrixAt(mossCount, dummy.matrix);
      color.set(random.pick(mossPalette));
      color.offsetHSL(random.signed(0.012), random.signed(0.025), random.range(-0.015, 0.035));
      mossMesh.setColorAt(mossCount, color);
      mossCount += 1;
    }
    const approximateTop = new THREE.Vector3(
      0,
      rockGeometry.boundingBox.max.y,
      0,
    ).applyMatrix4(dummy.matrix);
    placements.push({
      rockIndex: placedCount,
      position: dummy.position.clone(),
      normal: terrainNormal.clone(),
      yaw,
      usableRadius: Math.min(footprintRadiusX, footprintRadiusZ),
      approximateTopY: approximateTop.y,
      hasMoss,
      footprint,
    });
    placedCount += 1;
  }

  rockMesh.count = placedCount;
  mossMesh.count = mossCount;
  finishInstances(rockMesh);
  finishInstances(mossMesh);
  rockMesh.name = 'Clustered irregular woodland rocks';
  rockMesh.castShadow = Boolean(castShadow);
  rockMesh.receiveShadow = Boolean(receiveShadow);
  mossMesh.name = 'Moss caps on woodland rocks';
  mossMesh.castShadow = false;
  mossMesh.receiveShadow = Boolean(receiveShadow);

  const group = new THREE.Group();
  group.name = 'Procedural mossy rocks';
  group.add(rockMesh, mossMesh);
  const focusPoint = normalizedExclusionZones[0] ?? { x: 0, z: 0 };
  const propAnchor = selectPropAnchor(
    placements,
    rockMesh,
    focusPoint,
    habitatSize,
  );
  const containsGroundPoint = (pointX, pointZ, padding = 0) => footprints.some((footprint) => {
    const deltaX = pointX - footprint.x;
    const deltaZ = pointZ - footprint.z;
    const localX = deltaX * footprint.cosine + deltaZ * footprint.sine;
    const localZ = -deltaX * footprint.sine + deltaZ * footprint.cosine;
    const radiusX = footprint.radiusX + padding;
    const radiusZ = footprint.radiusZ + padding;
    return (localX * localX) / (radiusX * radiusX)
      + (localZ * localZ) / (radiusZ * radiusZ) < 1;
  });
  const surfaceHeightAt = (pointX, pointZ) => placements.reduce((highest, placement) => {
    const { footprint, position, approximateTopY } = placement;
    const deltaX = pointX - footprint.x;
    const deltaZ = pointZ - footprint.z;
    const localX = deltaX * footprint.cosine + deltaZ * footprint.sine;
    const localZ = -deltaX * footprint.sine + deltaZ * footprint.cosine;
    const normalizedDistance = (localX * localX) / (footprint.radiusX * footprint.radiusX)
      + (localZ * localZ) / (footprint.radiusZ * footprint.radiusZ);
    if (normalizedDistance >= 1) return highest;
    const topInfluence = Math.pow(1 - normalizedDistance, 0.42);
    return Math.max(highest, THREE.MathUtils.lerp(position.y, approximateTopY, topInfluence));
  }, -Infinity);
  const surfaceAnchors = Object.freeze(placements.map((placement) => Object.freeze({
    rockIndex: placement.rockIndex,
    position: Object.freeze({
      x: placement.position.x,
      y: placement.approximateTopY,
      z: placement.position.z,
    }),
    usableRadius: placement.usableRadius,
    footprint: Object.freeze({ ...placement.footprint }),
  })));
  const placementByIndex = new Map(placements.map((placement) => [
    placement.rockIndex,
    placement,
  ]));
  const surfaceRaycaster = new THREE.Raycaster();
  const surfaceOrigin = new THREE.Vector3();
  const getSurfacePoint = (
    rockIndex,
    pointX,
    pointZ,
    target = new THREE.Vector3(),
  ) => {
    const placement = placementByIndex.get(rockIndex);
    if (!placement) return null;
    const x = Number.isFinite(pointX) ? pointX : placement.position.x;
    const z = Number.isFinite(pointZ) ? pointZ : placement.position.z;
    rockMesh.updateMatrixWorld(true);
    surfaceOrigin.set(x, placement.approximateTopY + 3, z);
    surfaceRaycaster.set(surfaceOrigin, DOWN);
    const hit = surfaceRaycaster
      .intersectObject(rockMesh, false)
      .find((intersection) => intersection.instanceId === rockIndex);
    return hit ? target.copy(hit.point) : null;
  };
  const textures = [rockTextures.colorMap, rockTextures.bumpMap, mossTexture].filter(Boolean);
  group.userData.textures = textures;
  return {
    group,
    count: placedCount,
    requestedCount,
    mossCount,
    footprints,
    propAnchor,
    containsGroundPoint,
    surfaceHeightAt,
    surfaceAnchors,
    surfaceMesh: rockMesh,
    getSurfacePoint,
    textures,
  };
}
