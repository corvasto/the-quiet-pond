import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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
  const rampHeight = (x, z) => {
    const d = z - mouthZ;
    const blend = d <= 1.1 ? 0.58 * THREE.MathUtils.smoothstep(d, 0, 1.1)
      : 0.58 + 0.42 * THREE.MathUtils.smoothstep(d, 1.1, c.rampLength);
    return THREE.MathUtils.lerp(heightAt(x, mouthZ), layout.heightAt(x, doorZ), blend);
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
    const slices = [mouthZ, coverZ];
    for (let i = 1; i <= 64; i++) slices.push(mouthZ + c.rampLength * i / 64);
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
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#9c7754', roughness: 1, side: THREE.DoubleSide }));
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
  const supportHeight = (x, z, y) => ramp(x, z) && (opening(x, z) || y < rampHeight(x, z) + 0.15) ? rampHeight(x, z)
    : (layout?.isWalkable(x, z) || entryCollar(x, z, 0.075)) && y < layout.roofAt(x, z)
      ? layout.heightAt(x, z) : surfaceHeightAt(x, z);
  const inPassageXZ = (x, z, radius) => ramp(x, z) && Math.abs(x - c.x) <= passageWidth(z) - radius;
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
    || (z < coverZ && z > mouthZ - 1.5 && Math.abs(x - c.x) < 1.2 && y > heightAt(x, z) + 0.07)));
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
    cameraInPassage: (p) => Boolean(level && ramp(p.x, p.z) && p.y < heightAt(p.x, p.z) - 0.04),
    setPassageCamera: (p, camera, target) => {
      const eyeZ = Math.max(mouthZ - 0.15, p.z - 0.28);
      const eyeFloor = eyeZ < mouthZ ? heightAt(c.x, eyeZ) : rampHeight(c.x, eyeZ);
      const ceiling = eyeZ < coverZ ? Infinity : rampRoofAt(c.x, eyeZ) - 0.06;
      camera.position.set(c.x, Math.min(eyeFloor + 0.17, ceiling), eyeZ);
      target.set(c.x, rampHeight(c.x, Math.min(doorZ, p.z + 0.3)) + 0.13, p.z + 0.3);
      camera.lookAt(target);
    },
    adjustDecorations, inPassage, passage, openingLength: c?.openingLength, rampRoofAt, entrance: level ? { x: c.x, z: mouthZ } : null };
}
