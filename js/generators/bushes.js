import * as THREE from 'three';
import { SEASONS } from '../config/index.js';
import { SeededRandom } from '../utils/random.js';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const UP = new THREE.Vector3(0, 1, 0);

function createLeafGeometry() {
  const rows = [
    { y: 0, width: 0.03, fold: 0 },
    { y: 0.3, width: 0.72, fold: 0.08 },
    { y: 0.66, width: 1, fold: 0.12 },
    { y: 0.88, width: 0.58, fold: 0.065 },
    { y: 1, width: 0.02, fold: 0 },
  ];
  const positions = [];
  const uvs = [];
  const indices = [];

  for (const row of rows) {
    positions.push(
      -row.width * 0.5, row.y, 0,
      0, row.y, row.fold,
      row.width * 0.5, row.y, 0,
    );
    uvs.push(0, row.y, 0.5, row.y, 1, row.y);
  }

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    const current = rowIndex * 3;
    const next = current + 3;
    indices.push(
      current, next, current + 1,
      current + 1, next, next + 1,
      current + 1, next + 1, current + 2,
      current + 2, next + 1, next + 2,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = 'Sculpted shrub leaf';
  return geometry;
}

function createFoliagePalette(seasonName) {
  const season = SEASONS[seasonName] || SEASONS.summer;
  const seasonalLift = seasonName === 'autumn' ? 0.035 : 0.045;
  const sourcePalette = season.shrubs || season.leaves;

  return sourcePalette.map((value, index) => {
    const color = new THREE.Color(value);
    color.offsetHSL(
      index % 2 === 0 ? -0.008 : 0.008,
      seasonName === 'autumn' ? 0.012 : 0.018,
      seasonalLift + index * 0.008,
    );
    return color;
  });
}

function colorFromPalette(random, palette, extraLightness = 0) {
  const color = random.pick(palette).clone();
  color.offsetHSL(
    random.signed(0.012),
    random.signed(0.018),
    random.range(-0.012, 0.03) + extraLightness,
  );
  return color;
}

function addSegment(segments, start, end, radius, color) {
  if (start.distanceToSquared(end) < 0.0001) return;
  segments.push({
    start: start.clone(),
    end: end.clone(),
    radius,
    color,
  });
}

function createBushLayout(
  random,
  bushCount,
  heightAt,
  quality,
  placementRadius,
  exclusionZones,
  placement,
) {
  const bushes = [];
  const clumps = [];
  const stems = [];
  const leaves = [];
  const angleOffset = random.range(0, TAU);
  const stemColors = ['#71543a', '#826348', '#62482f', '#8b6c4f'];
  const annulusMode = placement.mode === 'annulus';
  const exclusionPadding = placement.exclusionPadding;
  const rejectPoint = placement.rejectPoint;
  const intersectsExclusion = (x, z) => exclusionZones.some((zone) => (
    Math.hypot(x - zone.x, z - zone.z) < zone.radius + exclusionPadding
  ));

  for (let bushIndex = 0; bushIndex < bushCount; bushIndex += 1) {
    const bushRandom = random.fork(`bush-${bushIndex}`);
    let angle;
    let radius;
    let x;
    let z;

    if (annulusMode) {
      let accepted = false;
      const angularStep = TAU / Math.max(1, bushCount);

      for (let placementAttempt = 0; placementAttempt < 24; placementAttempt += 1) {
        angle = angleOffset
          + bushIndex * angularStep
          + placementAttempt * GOLDEN_ANGLE
          + bushRandom.signed(angularStep * 0.46);
        const radialSample = bushRandom.float();
        radius = Math.sqrt(THREE.MathUtils.lerp(
          placement.minRadius * placement.minRadius,
          placement.maxRadius * placement.maxRadius,
          radialSample,
        ));
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        if (intersectsExclusion(x, z)) continue;
        if (rejectPoint && rejectPoint(x, z, 0.72)) continue;
        accepted = true;
        break;
      }

      if (!accepted) continue;
    } else {
      let accepted = false;
      for (let placementAttempt = 0; placementAttempt < 14; placementAttempt += 1) {
        angle = angleOffset
          + bushIndex * TAU / bushCount
          + placementAttempt * GOLDEN_ANGLE
          + bushRandom.signed(0.16);
        radius = placementRadius <= 7.25
          ? bushRandom.range(4.55, 7.25)
          : THREE.MathUtils.lerp(
            4.55,
            placementRadius,
            Math.sqrt(bushRandom.float()),
        );
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        if (intersectsExclusion(x, z)) continue;
        if (rejectPoint && rejectPoint(x, z, 0.32)) continue;
        accepted = true;
        break;
      }
      if (!accepted) continue;
    }
    const baseY = heightAt(x, z);
    const width = bushRandom.range(0.88, 1.16);
    const height = bushRandom.range(1.22, 1.82);
    const bushClumps = [];

    const centerClump = {
      position: new THREE.Vector3(x, baseY + height * 0.57, z),
      scale: new THREE.Vector3(width * 0.62, height * 0.45, width * 0.59),
      rotation: new THREE.Euler(
        bushRandom.signed(0.12),
        bushRandom.range(0, TAU),
        bushRandom.signed(0.12),
      ),
      bushIndex,
    };
    clumps.push(centerClump);
    bushClumps.push(centerClump);

    const outerCount = quality === 'high'
      ? bushRandom.int(11, 14)
      : bushRandom.int(8, 10);

    for (let clumpIndex = 0; clumpIndex < outerCount; clumpIndex += 1) {
      const clumpAngle = angle
        + clumpIndex * GOLDEN_ANGLE
        + bushRandom.signed(0.26);
      const radial = width * bushRandom.range(0.26, 0.62);
      const centerBias = 1 - radial / width;
      const clump = {
        position: new THREE.Vector3(
          x + Math.cos(clumpAngle) * radial,
          baseY + height * (
            bushRandom.range(0.4, 0.68)
            + centerBias * 0.08
            + (clumpIndex % 5 === 0 ? 0.09 : 0)
          ),
          z + Math.sin(clumpAngle) * radial,
        ),
        scale: new THREE.Vector3(
          width * bushRandom.range(0.35, 0.48),
          height * bushRandom.range(0.24, 0.34),
          width * bushRandom.range(0.34, 0.47),
        ),
        rotation: new THREE.Euler(
          bushRandom.signed(0.22),
          bushRandom.range(0, TAU),
          bushRandom.signed(0.22),
        ),
        bushIndex,
      };
      clumps.push(clump);
      bushClumps.push(clump);
    }

    const mainStemCount = quality === 'high'
      ? bushRandom.int(7, 9)
      : bushRandom.int(5, 7);

    for (let stemIndex = 0; stemIndex < mainStemCount; stemIndex += 1) {
      const target = bushClumps[1 + stemIndex % Math.max(1, bushClumps.length - 1)];
      const baseAngle = bushRandom.range(0, TAU);
      const baseRadius = bushRandom.range(0.015, 0.11);
      const startX = x + Math.cos(baseAngle) * baseRadius;
      const startZ = z + Math.sin(baseAngle) * baseRadius;
      const start = new THREE.Vector3(
        startX,
        heightAt(startX, startZ) + 0.025,
        startZ,
      );
      const end = target.position.clone();
      end.y -= target.scale.y * bushRandom.range(0.08, 0.34);
      end.x += bushRandom.signed(width * 0.12);
      end.z += bushRandom.signed(width * 0.12);
      const mid = start.clone().lerp(end, bushRandom.range(0.45, 0.59));
      const bendAngle = baseAngle + Math.PI / 2;
      mid.x += Math.cos(bendAngle) * bushRandom.signed(width * 0.1);
      mid.z += Math.sin(bendAngle) * bushRandom.signed(width * 0.1);
      const stemRadius = bushRandom.range(0.025, 0.045);
      const stemColor = bushRandom.pick(stemColors);
      addSegment(stems, start, mid, stemRadius, stemColor);
      addSegment(stems, mid, end, stemRadius * 0.72, stemColor);

      if (stemIndex % 2 === 0) {
        const forkTarget = bushClumps[
          1 + (stemIndex + Math.floor(bushClumps.length * 0.43)) % Math.max(1, bushClumps.length - 1)
        ];
        const forkStart = mid.clone().lerp(end, bushRandom.range(0.05, 0.3));
        const forkEnd = forkTarget.position.clone();
        forkEnd.y -= forkTarget.scale.y * bushRandom.range(0.18, 0.42);
        addSegment(stems, forkStart, forkEnd, stemRadius * 0.48, stemColor);
      }
    }

    const leafCount = quality === 'high'
      ? bushRandom.int(185, 235)
      : bushRandom.int(105, 135);
    const outerClumps = bushClumps.slice(1);

    for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
      const clump = bushRandom.chance(0.24)
        ? centerClump
        : bushRandom.pick(outerClumps);
      const azimuth = bushRandom.range(0, TAU);
      const vertical = bushRandom.range(-0.82, 1);
      const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const volumeDirection = new THREE.Vector3(
        Math.cos(azimuth) * horizontal,
        vertical,
        Math.sin(azimuth) * horizontal,
      );
      const clumpQuaternion = new THREE.Quaternion().setFromEuler(clump.rotation);
      const radialFill = bushRandom.chance(0.38)
        ? bushRandom.range(0.76, 1.04)
        : Math.cbrt(bushRandom.range(0.035, 0.94));
      const volumeOffset = volumeDirection.clone()
        .multiply(clump.scale)
        .applyQuaternion(clumpQuaternion)
        .multiplyScalar(radialFill);
      const position = clump.position.clone().add(volumeOffset);
      position.y = Math.max(position.y, baseY + bushRandom.range(0.12, 0.22));

      const direction = volumeDirection.clone()
        .applyQuaternion(clumpQuaternion)
        .multiplyScalar(bushRandom.range(0.52, 0.82))
        .add(new THREE.Vector3(
          bushRandom.signed(0.28),
          bushRandom.range(0.08, 0.34),
          bushRandom.signed(0.28),
        ))
        .normalize();
      leaves.push({
        position,
        direction,
        roll: bushRandom.range(0, TAU),
        length: bushRandom.range(0.16, 0.255),
      });
    }

    bushes.push({ x, z, baseY, width, height });
  }

  return { bushes, clumps, stems, leaves };
}

function finishInstances(mesh) {
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
  if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
}

function createStemMesh(stems, quality, shadowOptions = {}) {
  const geometry = new THREE.CylinderGeometry(
    0.52,
    1,
    1,
    quality === 'high' ? 7 : 5,
    1,
    false,
  );
  geometry.name = 'Tapered shrub stem segment';
  const material = new THREE.MeshStandardMaterial({
    name: 'Opaque shrub wood',
    color: '#ffffff',
    roughness: 0.96,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, stems.length);
  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  for (let index = 0; index < stems.length; index += 1) {
    const stem = stems[index];
    midpoint.copy(stem.start).add(stem.end).multiplyScalar(0.5);
    direction.subVectors(stem.end, stem.start);
    const length = direction.length();
    direction.multiplyScalar(1 / length);
    quaternion.setFromUnitVectors(UP, direction);
    scale.set(stem.radius, length, stem.radius * 0.92);
    matrix.compose(midpoint, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, new THREE.Color(stem.color));
  }

  finishInstances(mesh);
  mesh.name = 'Instanced woody shrub stems';
  mesh.castShadow = shadowOptions.castShadow ?? true;
  mesh.receiveShadow = shadowOptions.receiveShadow ?? true;
  return { mesh, geometry, material };
}

function createDetailLeafMesh(leaves, palette, random, shadowOptions = {}) {
  const geometry = createLeafGeometry();
  const material = new THREE.MeshStandardMaterial({
    name: 'Sculpted shrub leaf material',
    color: '#ffffff',
    roughness: 0.86,
    metalness: 0,
    emissive: '#26391c',
    emissiveIntensity: 0.15,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, leaves.length);
  const align = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index];
    align.setFromUnitVectors(UP, leaf.direction);
    roll.setFromAxisAngle(UP, leaf.roll);
    quaternion.copy(align).multiply(roll);
    scale.set(leaf.length * 0.56, leaf.length, leaf.length * 0.72);
    matrix.compose(leaf.position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colorFromPalette(random, palette, 0.045));
  }

  finishInstances(mesh);
  mesh.name = 'Instanced shrub crown leaves';
  mesh.castShadow = shadowOptions.castShadow ?? true;
  mesh.receiveShadow = shadowOptions.receiveShadow ?? false;
  return { mesh, geometry, material };
}

/**
 * Builds a deterministic ring of terrain-conforming shrubs around the tree.
 * @param {object} options Shrub generation controls.
 * @param {object} [options.placement] Optional alternate placement controls.
 * @param {'annulus'} [options.placement.mode] Enables annular placement.
 * @param {number} [options.placement.minRadius] Inner annulus radius.
 * @param {number} [options.placement.maxRadius] Outer annulus radius.
 * @param {number} [options.placement.count] Requested shrub count.
 * @param {string} [options.placement.variant] Deterministic seed salt.
 * @param {boolean} [options.placement.castShadow] Shadow casting override.
 * @param {boolean} [options.placement.receiveShadow] Shadow receiving override.
 * @param {number} [options.placement.exclusionPadding] Extra tree clearing radius.
 * @param {Function} [options.placement.rejectPoint] Additional placement rejection callback.
 * @returns {{group: THREE.Group, count: number, requestedCount: number, foliageCount: number}}
 */
export function createBushes({
  seed = 'ancient-oak',
  season = 'summer',
  quality = 'high',
  heightAt = () => 0,
  populationScale = 1,
  placementRadius = 7.25,
  exclusionZones = [],
  placement = null,
} = {}) {
  const normalizedQuality = quality === 'low' ? 'low' : 'high';
  const normalizedSeason = SEASONS[season] ? season : 'summer';
  const groundHeightAt = typeof heightAt === 'function' ? heightAt : () => 0;
  const variant = placement?.variant == null || placement.variant === ''
    ? ''
    : `:${String(placement.variant)}`;
  const random = new SeededRandom(`${seed}:shrubs${variant}`);
  const normalizedExclusionZones = Array.isArray(exclusionZones)
    ? exclusionZones.filter((zone) => (
      Number.isFinite(zone?.x)
      && Number.isFinite(zone?.z)
      && Number.isFinite(zone?.radius)
    ))
    : [];
  const countBase = normalizedQuality === 'high'
    ? random.int(9, 10)
    : random.int(8, 9);
  const configuredCount = Number.isFinite(placement?.count)
    ? placement.count
    : placement?.requestedCount;
  const requestedCount = Number.isFinite(configuredCount)
    ? Math.max(0, Math.round(configuredCount))
    : Math.round(countBase * populationScale);
  const annulusMode = placement?.mode === 'annulus';
  const requestedMinRadius = Number(placement?.minRadius);
  const requestedMaxRadius = Number(placement?.maxRadius);
  const minRadius = annulusMode && Number.isFinite(requestedMinRadius)
    ? Math.max(0, requestedMinRadius)
    : 4.55;
  const maxRadius = annulusMode
    ? Math.max(
      minRadius + 0.01,
      Number.isFinite(requestedMaxRadius) ? requestedMaxRadius : placementRadius,
    )
    : placementRadius;
  const exclusionPadding = Number.isFinite(placement?.exclusionPadding)
    ? Math.max(0, placement.exclusionPadding)
    : 0.95;
  const rejectPoint = typeof placement?.rejectPoint === 'function'
    ? placement.rejectPoint
    : null;
  const normalizedPlacement = {
    mode: annulusMode ? 'annulus' : 'default',
    minRadius,
    maxRadius,
    exclusionPadding,
    rejectPoint,
  };
  const hasReceiveShadowOverride = placement != null
    && Object.prototype.hasOwnProperty.call(placement, 'receiveShadow');
  const shadowOptions = {
    castShadow: placement?.castShadow == null ? true : Boolean(placement.castShadow),
    receiveShadow: hasReceiveShadowOverride
      ? Boolean(placement.receiveShadow)
      : undefined,
  };
  const palette = createFoliagePalette(normalizedSeason);
  const layout = createBushLayout(
    random.fork('layout'),
    requestedCount,
    groundHeightAt,
    normalizedQuality,
    placementRadius,
    normalizedExclusionZones,
    normalizedPlacement,
  );
  const stemLayer = createStemMesh(layout.stems, normalizedQuality, shadowOptions);
  const leafLayer = createDetailLeafMesh(
    layout.leaves,
    palette,
    random.fork('leaf-colors'),
    shadowOptions,
  );
  const group = new THREE.Group();
  const count = layout.bushes.length;
  const foliageCount = layout.leaves.length;

  group.name = 'Procedural woodland shrubs';
  group.add(stemLayer.mesh, leafLayer.mesh);
  group.userData.shrubStats = Object.freeze({
    count,
    requestedCount,
    stemSegments: layout.stems.length,
    crownAnchorCount: layout.clumps.length,
    leafCount: layout.leaves.length,
    foliageCount,
    drawCalls: 2,
  });

  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return;
    disposed = true;

    for (const layer of [stemLayer, leafLayer]) {
      if (typeof layer.mesh.dispose === 'function') layer.mesh.dispose();
      layer.geometry.dispose();
      layer.material.dispose();
    }
  };

  return { group, count, requestedCount, foliageCount };
}
