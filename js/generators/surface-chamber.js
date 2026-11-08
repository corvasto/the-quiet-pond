import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSoilFloorUVs } from './soil-texture.js';

// Clip each terrain triangle around a rectangular entrance, retaining its UVs/colors.
export function cutTerrainOpening(source, bounds) {
  const raw = source.toNonIndexed();
  const names = Object.keys(raw.attributes).filter((name) => name !== 'normal');
  const sizes = names.map((name) => raw.attributes[name].itemSize);
  const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((a, b) => a + b, 0));
  const stride = sizes.reduce((a, b) => a + b, 0);
  const output = names.map(() => []);
  const emit = (polygon) => {
    for (let i = 1; i + 1 < polygon.length; i++) for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
      names.forEach((_, j) => output[j].push(...vertex.slice(offsets[j], offsets[j] + sizes[j])));
    }
  };
  const positionOffset = offsets[names.indexOf('position')];
  const radius = bounds.radius ?? 0;
  const outline = [];
  for (const [x, z, start] of [[bounds.right - radius, bounds.front - radius, 0],
    [bounds.left + radius, bounds.front - radius, Math.PI / 2],
    [bounds.left + radius, bounds.back + radius, Math.PI],
    [bounds.right - radius, bounds.back + radius, Math.PI * 1.5]]) {
    for (let i = 0; i <= (radius ? 6 : 0); i++) {
      const angle = start + (radius ? i / 6 * Math.PI / 2 : 0);
      outline.push([x + radius * Math.cos(angle), z + radius * Math.sin(angle)]);
    }
  }
  const edges = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    return { x: a[1] - b[1], z: b[0] - a[0], a };
  });
  for (let i = 0; i < raw.attributes.position.count; i += 3) {
    let polygon = [0, 1, 2].map((v) => names.flatMap((name) => {
      const attr = raw.attributes[name];
      return Array.from(attr.array.slice((i + v) * attr.itemSize, (i + v + 1) * attr.itemSize));
    }));
    for (const edge of edges) {
      const inside = [], outside = [];
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[j], b = polygon[(j + 1) % polygon.length];
        const signed = (v) => (v[positionOffset] - edge.a[0]) * edge.x + (v[positionOffset + 2] - edge.a[1]) * edge.z;
        const da = signed(a), db = signed(b);
        (da >= 0 ? inside : outside).push(a);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          const cross = Array.from({ length: stride }, (_, k) => a[k] + (b[k] - a[k]) * t);
          inside.push(cross); outside.push(cross);
        }
      }
      emit(outside);
      polygon = inside;
      if (!polygon.length) break;
    }
  }
  const result = new THREE.BufferGeometry();
  names.forEach((name, j) => result.setAttribute(name, new THREE.Float32BufferAttribute(output[j], sizes[j])));
  result.computeVertexNormals();
  raw.dispose();
  return result;
}

export function createSurfaceChamber({ config, terrain, heightAt }) {
  const level = config.level ?? null, layout = level?.layout;
  const c = config.chamber;
  const halfDoor = c ? c.doorwayWidth / 2 : 0;
  const mouthZ = c ? c.z - c.length / 2 - c.rampLength : 0;
  const doorZ = c ? c.z - c.length / 2 : 0;
  const coverZ = c ? mouthZ + c.openingLength : 0;
  const passageWidth = (z) => {
    const distance = z - mouthZ;
    const wide = THREE.MathUtils.lerp(halfDoor, c.passageWidth / 2,
      THREE.MathUtils.smoothstep(distance, 0, 0.7));
    return THREE.MathUtils.lerp(wide, layout.cellSize / 2,
      THREE.MathUtils.smoothstep(z, doorZ - 0.35, doorZ));
  };
  const ramp = (x, z) => Boolean(level && z >= mouthZ && z <= doorZ && Math.abs(x - c.x) <= passageWidth(z));
  const opening = (x, z) => {
    if (!level) return false;
    const r = c.cornerRadius;
    const dx = Math.max(0, Math.abs(x - c.x) - (halfDoor - r));
    const dz = Math.max(0, Math.abs(z - (mouthZ + coverZ) / 2) - (c.openingLength / 2 - r));
    return Math.hypot(dx, dz) <= r;
  };
  const rampStart = level ? heightAt(c.x, mouthZ) : 0;
  const rampEnd = level ? layout.heightAt(c.x, doorZ) : 0;
  const rampHeight = (x, z) => {
    const t = THREE.MathUtils.clamp((z - mouthZ) / c.rampLength, 0, 1);
    const plane = THREE.MathUtils.lerp(rampStart, rampEnd, t);
    // Only the short landings follow the authored contours at each end.
    if (z < mouthZ + 0.1) return plane + (heightAt(x, mouthZ) - rampStart)
      * (1 - THREE.MathUtils.smoothstep(z, mouthZ, mouthZ + 0.1));
    if (z > doorZ - 0.15) return plane + (layout.heightAt(x, doorZ) - rampEnd)
      * THREE.MathUtils.smoothstep(z, doorZ - 0.15, doorZ);
    return plane;
  };
  const rampRoofAt = (x, z) => THREE.MathUtils.lerp(heightAt(x, z) - c.roofThickness,
    layout.roofAt(x, doorZ), THREE.MathUtils.smoothstep(z, coverZ, doorZ));
  const patchHeight = (patch, x, z) => {
    if (!patch) return 0;
    const distance = Math.hypot(x - patch.x, z - patch.z) / patch.radius;
    return distance < 1 ? patch.height * (1 - distance * distance) ** 2
      * (0.65 + 0.35 * Math.cos((x - patch.x) * 3)) : 0;
  };
  const terrainOffset = (x, z) => patchHeight(config.bumps, x, z) + patchHeight(config.dip, x, z);
  const surfaceHeightAt = (x, z) => opening(x, z) ? rampHeight(x, z) : heightAt(x, z) + terrainOffset(x, z);
  if (level) {
    const old = terrain.geometry;
    terrain.geometry = cutTerrainOpening(old, { left: c.x - halfDoor, right: c.x + halfDoor, back: mouthZ, front: coverZ, radius: c.cornerRadius });
    old.dispose();
  }
  const positions = terrain.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i,
    positions.getY(i) + terrainOffset(positions.getX(i), positions.getZ(i)));
  terrain.geometry.computeVertexNormals();
  const group = new THREE.Group(); group.name = 'In-world burrow underground';
  if (level) {
    group.add(level.group);
    const vertices = [];
    const quad = (a, b, d, e) => vertices.push(...a, ...b, ...d, ...b, ...e, ...d);
    const solidPanel = (a, b, d, e, dx, dy) => {
      const shift = (p) => [p[0] + dx, p[1] + dy, p[2]];
      const aa = shift(a), bb = shift(b), dd = shift(d), ee = shift(e);
      quad(a, b, d, e); quad(aa, dd, bb, ee);
      quad(a, aa, b, bb); quad(d, e, dd, ee);
      quad(a, d, aa, dd); quad(b, bb, e, ee);
    };
    // Split exactly at the rim so floor, wall, ceiling and terrain edges meet.
    const slices = [mouthZ, mouthZ + 0.1, coverZ, doorZ - 0.15];
    for (let i = 1; i <= 8; i++) slices.push(mouthZ + c.rampLength * i / 8);
    slices.sort((a, b) => a - b);
    for (let i = 0; i + 1 < slices.length; i++) {
      const a = slices[i], b = slices[i + 1];
      if (b - a < 1e-8) continue;
      const wa = passageWidth(a), wb = passageWidth(b);
      const point = (x, z) => [x, rampHeight(x, z), z];
      for (let j = 0; j < 5; j++) {
        solidPanel(point(c.x - wa + 2 * wa * j / 5, a), point(c.x - wa + 2 * wa * (j + 1) / 5, a),
          point(c.x - wb + 2 * wb * j / 5, b), point(c.x - wb + 2 * wb * (j + 1) / 5, b), 0, -0.08);
      }
      const covered = a >= coverZ - 1e-8;
      const top = (x, z) => covered ? rampRoofAt(x, z) : heightAt(x, z);
      for (const side of [-1, 1]) {
        const xa = c.x + side * wa, xb = c.x + side * wb;
        solidPanel(point(xa, a), point(xb, b), [xa, top(xa, a), a], [xb, top(xb, b), b], side * 0.1, 0);
        if (!covered) {
          // Widen beneath the surface while retaining a small mouth in the terrain.
          solidPanel([xa, heightAt(xa, a) - c.roofThickness, a], [xb, heightAt(xb, b) - c.roofThickness, b],
            [c.x + side * halfDoor, heightAt(c.x + side * halfDoor, a) - c.roofThickness, a],
            [c.x + side * halfDoor, heightAt(c.x + side * halfDoor, b) - c.roofThickness, b], 0, c.roofThickness - 0.002);
        }
      }
      if (covered) for (let j = 0; j < 5; j++) {
        const p = (w, z, t) => { const x = c.x - w + 2 * w * t; return [x, rampRoofAt(x, z), z]; };
        solidPanel(p(wa, a, j / 5), p(wa, a, (j + 1) / 5), p(wb, b, j / 5), p(wb, b, (j + 1) / 5), 0, c.roofThickness);
      }
    }
    // The short exposed rim has a solid cross section rather than a visible sheet.
    const width = passageWidth(coverZ);
    quad([c.x - width, rampRoofAt(c.x - width, coverZ), coverZ], [c.x + width, rampRoofAt(c.x + width, coverZ), coverZ],
      [c.x - width, heightAt(c.x - width, coverZ), coverZ], [c.x + width, heightAt(c.x + width, coverZ), coverZ]);
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const geometry = mergeVertices(raw, 0.0001); raw.dispose(); geometry.computeVertexNormals();
    addSoilFloorUVs(geometry);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#9c7754', roughness: 1, side: THREE.DoubleSide,
      map: level.soilTexture, emissiveMap: level.soilTexture, bumpMap: level.soilTexture, bumpScale: 0.004 }));
    mesh.name = 'Covered burrow ramp shell';
    mesh.material.emissive.copy(mesh.material.color).multiplyScalar(0.35);
    mesh.receiveShadow = true; group.add(mesh);

  }
  const minX = layout ? Math.min(...layout.cells.map((cell) => cell.x)) - layout.cellSize / 2 : 0;
  const maxX = layout ? Math.max(...layout.cells.map((cell) => cell.x)) + layout.cellSize / 2 : 0;
  const minZ = layout ? Math.min(...layout.cells.map((cell) => cell.z)) - layout.cellSize / 2 : 0;
  const maxZ = layout ? Math.max(...layout.cells.map((cell) => cell.z)) + layout.cellSize / 2 : 0;
  const below = (p) => Boolean(level && p && p.y < heightAt(p.x, p.z) - (ramp(p.x, p.z) ? 0.04 : 0.2)
    && p.x > minX - 0.1 && p.x < maxX + 0.1 && p.z >= Math.min(minZ, mouthZ) && p.z < maxZ + 0.1);
  const supportHeight = (x, z, y) => ramp(x, z) && (opening(x, z) || y < heightAt(x, z) - 0.04) ? rampHeight(x, z)
    : (layout?.isWalkable(x, z) || entryCollar(x, z, 0.075)) && y < layout.roofAt(x, z)
      ? layout.heightAt(x, z) : surfaceHeightAt(x, z);
  const inPassageXZ = (x, z, radius) => ramp(x, z) && Math.abs(x - c.x) <= passageWidth(z) - radius
    && (z >= coverZ || (opening(x - radius, z) && opening(x + radius, z)
      && (z - radius < mouthZ || opening(x, z - radius)) && opening(x, z + radius))
      || heightAt(x, z) - c.roofThickness - rampHeight(x, z) >= 0.14);
  const inPassage = (p, radius = 0.04) => Boolean(p && inPassageXZ(p.x, p.z, radius));
  const entryCollar = (x, z, radius) => Boolean(level && Math.abs(x - c.x) <= layout.cellSize / 2 - radius
    && z >= doorZ && z <= doorZ + radius + 0.01);
  const canOccupy = (p, x, z, radius) => !below(p) || inPassageXZ(x, z, radius)
    || layout.isWalkable(x, z, radius) || entryCollar(x, z, radius);
  const canMove = (p, x, z, radius) => {
    if (!level) return true;
    if (!canOccupy(p, x, z, radius)) return false;
    if (below(p) || ramp(x, z)) return Math.abs(supportHeight(x, z, p.y) - supportHeight(p.x, p.z, p.y)) <= 0.18;
    return true;
  };
  const containsCamera = (x, y, z) => Boolean(level && (
    ((layout.isWalkable(x, z, 0.065) || entryCollar(x, z, 0.065))
      && y > layout.heightAt(x, z) + 0.07 && y < layout.roofAt(x, z) - 0.07)
    || (inPassageXZ(x, z, 0.05) && y > rampHeight(x, z) + 0.05 && (z < coverZ || y < rampRoofAt(x, z) - 0.05))
    || (z < coverZ && z > mouthZ - 1.5 && Math.abs(x - c.x) < 1.2 && y > heightAt(x, z) + 0.025)));
  const adjustDecorations = (objects) => {
    for (const object of objects) object?.traverse((mesh) => {
      if (!mesh.isInstancedMesh) return;
      const data = mesh.instanceMatrix.array;
      for (let i = 0; i < mesh.instanceMatrix.count; i++) {
        const offset = i * 16, x = data[offset + 12], z = data[offset + 14];
        if (level && Math.abs(x - c.x) < 1.3 && z > mouthZ - 0.65 && z < doorZ + 0.5) data.fill(0, offset, offset + 12);
        else data[offset + 13] += terrainOffset(x, z);
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    });
  };
  const passage = [];
  if (level) for (const side of [-1, 1]) for (let i = 0; i <= 24; i++) {
    const z = mouthZ + c.rampLength * (side === -1 ? i : 24 - i) / 24;
    passage.push({ x: c.x + side * passageWidth(z), z });
  }
  return { group, layout, level, surfaceHeightAt, supportHeight, canOccupy, canMove, below, containsCamera,
    cameraDistance: config.cameraDistance,
    surfaceCameraRadius: config.surfaceCameraRadius,
    entranceCameraFov: config.entranceCameraFov,
    passageCameraTurnDuration: config.passageCameraTurnDuration,
    passageCameraTurnRadius: config.passageCameraTurnRadius,
    passageAntTurnResponsiveness: config.passageAntTurnResponsiveness,
    cameraNearBurrow: (p) => Boolean(level && p.z < mouthZ + 0.25
      && Math.hypot(p.x - c.x, p.z - mouthZ) < config.surfaceCameraRadius),
    actorRadius: layout?.antRadius,
    isSurfaceEntrance: (x, z) => opening(x, z),
    approachEntrance: (x, z, radius) => Boolean(level && z >= mouthZ - 0.9 && z <= mouthZ
      && Math.abs(x - c.x) <= halfDoor - radius),
    isSheltered: (p) => Boolean(below(p) && ((inPassage(p) && p.z >= coverZ && p.y < rampRoofAt(p.x, p.z) - 0.08)
      || (layout.isWalkable(p.x, p.z) && p.y < layout.roofAt(p.x, p.z) - 0.08))),
    interiorLightingBlend: (p, camera) => below(p) && below(camera)
      ? THREE.MathUtils.smoothstep(Math.min(p.z, camera.z), coverZ + config.interiorLightingInset,
        coverZ + config.interiorLightingInset + config.interiorLightingBlendLength) : 0,
    cameraInPassage: (p) => Boolean(level && (ramp(p.x, p.z)
      || (p.z >= doorZ && p.z < doorZ + 0.55 && Math.abs(p.x - c.x) < layout.cellSize / 2 - layout.antRadius))
      && p.y < heightAt(p.x, p.z) - 0.04),
    cameraAtMouth: (p) => Boolean(level && Math.abs(p.x - c.x) < c.passageWidth / 2
      && p.z >= mouthZ - 0.05 && p.z <= mouthZ + 0.6),
    setPassageCamera: (p, camera, target, direction = 1) => {
      const eyeZ = p.z - direction * config.entranceCameraDistance;
      const halfWidth = eyeZ >= mouthZ && eyeZ <= doorZ ? passageWidth(eyeZ) - 0.075 : layout.cellSize * 1.5 - 0.075;
      const eyeX = THREE.MathUtils.clamp(p.x, c.x - halfWidth, c.x + halfWidth);
      const eyeFloor = eyeZ < mouthZ ? heightAt(eyeX, eyeZ)
        : eyeZ > doorZ ? layout.heightAt(eyeX, eyeZ) : rampHeight(eyeX, eyeZ);
      const ceiling = eyeZ < coverZ ? Infinity
        : (eyeZ > doorZ ? layout.roofAt(eyeX, eyeZ) : rampRoofAt(eyeX, eyeZ)) - 0.065;
      camera.position.set(eyeX, Math.min(Math.max(eyeFloor + 0.12, p.y + 0.16), ceiling), eyeZ);
      // Frame the ant itself, rather than a point farther down the slope.
      target.set(p.x, p.y + 0.08, p.z);
      camera.lookAt(target);
    },
    adjustDecorations, inPassage, passage, openingLength: c?.openingLength, rampRoofAt, entrance: level ? { x: c.x, z: mouthZ } : null };
}
