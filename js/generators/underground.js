import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createUndergroundLayout } from '../content/underground-layout.js';
import { createSoilTexture, addSoilFloorUVs } from './soil-texture.js';

function variation(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createUnderground({ treePosition, barkMaterial, layout = createUndergroundLayout({ treePosition }),
  rootExtension = 0 } = {}) {
  const { cellSize, cells, landmarks } = layout;
  const group = new THREE.Group();
  group.name = 'Beneath the roots - first floor';
  const geometries = [];
  const materials = [];
  const geometry = (value) => { geometries.push(value); return value; };
  const material = (value) => { materials.push(value); return value; };
  const soil = material(new THREE.MeshStandardMaterial({
    color: '#9c7754', roughness: 1,
  }));
  const soilTexture = createSoilTexture();
  const floorMaterial = material(new THREE.MeshStandardMaterial({ color: '#b18b62', roughness: 1,
    map: soilTexture, emissiveMap: soilTexture, bumpMap: soilTexture, bumpScale: 0.004 }));
  const ceilingMaterial = material(new THREE.MeshStandardMaterial({ color: '#896746', roughness: 1 }));
  const rootMaterial = material(barkMaterial ? barkMaterial.clone()
    : new THREE.MeshStandardMaterial({ color: '#75502f', roughness: 1 }));
  // Bump detail leaves the authored bark color unchanged and needs no download.
  const barkPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const grain = Math.sin(x * 1.8 + 0.8 * Math.sin(y * 0.2)) * 0.3
      + Math.sin(x * 4.3 + y * 0.08) * 0.16;
    const value = Math.round((0.5 + grain) * 255), offset = (y * 64 + x) * 4;
    barkPixels[offset] = value; barkPixels[offset + 1] = value; barkPixels[offset + 2] = value; barkPixels[offset + 3] = 255;
  }
  const barkBump = new THREE.DataTexture(barkPixels, 64, 64);
  barkBump.wrapS = barkBump.wrapT = THREE.RepeatWrapping;
  barkBump.needsUpdate = true;
  rootMaterial.bumpMap = barkBump; rootMaterial.bumpScale = 0.028;
  const pebble = geometry(new THREE.DodecahedronGeometry(1, 0));
  const temporary = new THREE.Object3D();
  const color = new THREE.Color();
  const walls = [];
  for (const cell of cells) {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (layout.hasCell(cell.column + dc, cell.row + dr)) continue;
      if (cell.column === 0 && cell.row === -1 && dr === -1) continue;
      walls.push({ x: cell.x + dc * (cellSize / 2 + 0.09),
        z: cell.z + dr * (cellSize / 2 + 0.09), dc, dr });
    }
  }
  function instances(name, shape, surface, count, place) {
    const mesh = new THREE.InstancedMesh(shape, surface, count);
    mesh.name = name;
    for (let i = 0; i < count; i += 1) {
      temporary.position.set(0, 0, 0);
      temporary.rotation.set(0, 0, 0);
      temporary.scale.set(1, 1, 1);
      place(temporary, i);
      temporary.updateMatrix();
      mesh.setMatrixAt(i, temporary.matrix);
      color.setRGB(1, 0.97, 0.9).multiplyScalar(0.84 + variation(i + count) * 0.3);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  // Shared vertices and continuous height fields remove the per-cell tile shading.
  function earthMesh(name, surface, vertices) {
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const joined = geometry(mergeVertices(raw, 0.0001));
    raw.dispose();
    joined.computeVertexNormals();
    const mesh = new THREE.Mesh(joined, surface);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  const floorVertices = [], roofVertices = [], wallVertices = [];
  const triangle = (array, a, b, c) => array.push(...a, ...b, ...c);
  const subdivisions = 5;
  for (const cell of cells) {
    for (let row = 0; row < subdivisions; row++) for (let column = 0; column < subdivisions; column++) {
      const x = cell.x - cellSize / 2 + column * cellSize / subdivisions;
      const z = cell.z - cellSize / 2 + row * cellSize / subdivisions;
      const d = cellSize / subdivisions;
      const f = (px, pz) => [px, layout.heightAt(px, pz), pz];
      const r = (px, pz) => [px, layout.roofAt(px, pz), pz];
      triangle(floorVertices, f(x,z), f(x,z+d), f(x+d,z));
      triangle(floorVertices, f(x+d,z), f(x,z+d), f(x+d,z+d));
      triangle(roofVertices, r(x,z), r(x+d,z), r(x,z+d));
      triangle(roofVertices, r(x+d,z), r(x+d,z+d), r(x,z+d));
    }
  }
  addSoilFloorUVs(earthMesh('Packed earth floor', floorMaterial, floorVertices).geometry);
  earthMesh('Solid earth ceiling', ceilingMaterial, roofVertices);
  // Boundary vertices are shared exactly with the floor and roof, including corners.
  for (const wall of walls) {
    const point = (along, t) => {
      const inset = 0;
      const x = wall.x - wall.dc * (0.09 + inset) + wall.dr * along;
      const z = wall.z - wall.dr * (0.09 + inset) - wall.dc * along;
      const low = layout.heightAt(x,z), high = layout.roofAt(x,z);
      return [x, low + (high-low)*t, z];
    };
    for (let i=0; i<5; i++) for (let j=0; j<8; j++) {
      const a = -cellSize/2 + i*cellSize/5, b = a+cellSize/5;
      const t = j/8, u = (j+1)/8;
      triangle(wallVertices, point(a,t), point(a,u), point(b,t));
      triangle(wallVertices, point(b,t), point(a,u), point(b,u));
    }
  }
  soil.side = THREE.DoubleSide;
  earthMesh('Enclosed soil walls', soil, wallVertices);
  const frameMaterial = material(new THREE.MeshStandardMaterial({
    color: '#684a32', roughness: 1, side: THREE.DoubleSide,
  }));
  const frameVertices = [];
  const frameZ = layout.spawn.z - cellSize * 1.5 + 0.008;
  const left = layout.spawn.x - cellSize / 2, right = layout.spawn.x + cellSize / 2;
  const band = 0.1;
  const frameQuad = (a, b, c, d) => frameVertices.push(...a, ...b, ...c, ...b, ...d, ...c);
  // Dark soil trim stays outside the clear passage, marking the way to the ramp.
  for (const [inner, outer] of [[left, left - band], [right, right + band]]) {
    const low = layout.heightAt(inner, frameZ), high = layout.roofAt(inner, frameZ);
    frameQuad([inner, low, frameZ], [outer, low, frameZ],
      [inner, high, frameZ], [outer, high + band, frameZ]);
  }
  frameQuad([left, layout.roofAt(left, frameZ), frameZ], [right, layout.roofAt(right, frameZ), frameZ],
    [left - band, layout.roofAt(left, frameZ) + band, frameZ], [right + band, layout.roofAt(right, frameZ) + band, frameZ]);
  earthMesh('Dark soil entrance frame', frameMaterial, frameVertices);
  // Shallow irregular clods give the square passages a hand-dug surface.
  // Keep their inward extent below the actor and camera collision margin.
  instances('Uneven soil clods', pebble, soil, walls.length * 3, (object, i) => {
    const wall = walls[Math.floor(i / 3)];
    const across = (variation(i + 300) - 0.5) * cellSize * 0.8;
    object.position.set(wall.x - wall.dc * 0.075 + (wall.dr ? across : 0),
      layout.heightAt(wall.x, wall.z) + 0.16 + variation(i + 600) * 0.6,
      wall.z - wall.dr * 0.075 + (wall.dc ? across : 0));
    object.scale.set(wall.dc ? 0.05 : 0.12 + variation(i) * 0.12,
      0.06 + variation(i + 20) * 0.11, wall.dr ? 0.05 : 0.12 + variation(i) * 0.12);
    object.rotation.y = variation(i + 50) * 0.3;
  });
  function curvedRoot(name, points, radius, tipRadius) {
    const curve = new THREE.CatmullRomCurve3(points);
    const segments = 24, sides = 10;
    const frames = curve.computeFrenetFrames(segments, false);
    const vertices = [], indices = [], uvs = [];
    const length=curve.getLength();
    const repeats=Math.max(1,Math.round(radius*Math.PI*2/1.35));
    const point = new THREE.Vector3();
    for (let i=0; i<=segments; i++) {
      const t=i/segments;
      curve.getPointAt(t, point);
      const taper = THREE.MathUtils.lerp(radius, tipRadius, t);
      for (let j=0; j<=sides; j++) {
        const angle=j/sides*Math.PI*2;
        uvs.push(j/sides*repeats,t*length/8);
        const width=taper*(1+0.07*Math.sin(t*17+angle*3));
        vertices.push(point.x+width*(frames.normals[i].x*Math.cos(angle)+frames.binormals[i].x*Math.sin(angle)),
          point.y+width*(frames.normals[i].y*Math.cos(angle)+frames.binormals[i].y*Math.sin(angle)),
          point.z+width*(frames.normals[i].z*Math.cos(angle)+frames.binormals[i].z*Math.sin(angle)));
      }
    }
    for(let i=0;i<segments;i++) for(let j=0;j<sides;j++) {
      const a=i*(sides+1)+j, b=a+sides+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
    // End caps sit inside earth or inside the parent root.
    for(let j=1;j<sides-1;j++) {
      indices.push(0,j+1,j);
      const end=segments*(sides+1);
      indices.push(end,end+j,end+j+1);
    }
    const shape=geometry(new THREE.BufferGeometry());
    shape.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    shape.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    shape.setIndex(indices); shape.computeVertexNormals();
    const root=new THREE.Mesh(shape,rootMaterial); root.name=name;
    group.add(root);
  }
  const tree = layout.treePosition;
  const rootTop = layout.roofAt(tree.x,tree.z)+0.3+rootExtension;
  const rootBottom = layout.heightAt(tree.x,tree.z)-0.2-rootExtension;
  // The whole curved taproot stays inside its circular collision footprint.
  curvedRoot('Curved tree taproot',[
    new THREE.Vector3(tree.x,rootTop,tree.z),
    new THREE.Vector3(tree.x+0.045,rootTop-0.45,tree.z-0.025),
    new THREE.Vector3(tree.x-0.035,rootBottom+0.35,tree.z+0.04),
    new THREE.Vector3(tree.x,rootBottom,tree.z),
  ],layout.rootRadius*0.78,layout.rootRadius*0.42);
  for(let i=0;i<5;i++) {
    const angle=i*Math.PI*2/5+0.2;
    const points=[];
    for(let j=0;j<4;j++) {
      const distance=j*0.48;
      const bend=angle+0.16*Math.sin(j+i);
      const x=tree.x+Math.cos(bend)*distance, z=tree.z+Math.sin(bend)*distance;
      points.push(new THREE.Vector3(x,layout.roofAt(x,z)+0.025,z));
    }
    curvedRoot('Tapered roof root',points,0.09,0.008);
  }
  {
    // Mesh-local fill keeps the interior readable without illuminating the surface.
    for (const surface of materials) if (surface.emissive) {
      surface.emissive.copy(surface.color).multiplyScalar(0.45);
    }
    // The extended root can join the surface trunk, so keep its bark unlit.
    rootMaterial.emissive.set(0x000000);
    const block = geometry(new THREE.BoxGeometry(1, 1, 1));
    instances('Solid soil behind tunnel walls', block, soil, walls.length, (object, i) => {
      const wall = walls[i];
      const low = layout.heightAt(wall.x, wall.z) - 0.08;
      const high = layout.roofAt(wall.x, wall.z) + 0.08;
      object.position.set(wall.x, (low + high) / 2, wall.z);
      object.scale.set(wall.dc ? 0.16 : cellSize + 0.16, high - low,
        wall.dr ? 0.16 : cellSize + 0.16);
    });
  }
  let disposed = false;
  return { group, layout, soilTexture, spawn: layout.spawn, exit: layout.exit, landmarks,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse((object) => { if (object.isInstancedMesh) object.dispose(); });
      for (const value of geometries) value.dispose();
      for (const value of materials) value.dispose();
      barkBump.dispose();
      soilTexture.dispose();
    },
  };
}
