import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.module.js';

async function importRuntime(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  const source = (await fs.readFile(url, 'utf8')).replace(
    /from (['"])([^'"]+)\1/g,
    (match, quote, specifier) => {
      const resolved = specifier === 'three'
        ? new URL('../vendor/three/build/three.module.js', import.meta.url)
        : new URL(specifier, url);
      return `from ${quote}${resolved.href}${quote}`;
    },
  );
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const { AntClimbing } = await importRuntime('../js/game/ant-climbing.js');
const { installPondWorldQueryMethods } = await importRuntime('../js/core/app-world-query.js');
class QueryHarness {}
installPondWorldQueryMethods(QueryHarness);
const app = new QueryHarness();
Object.assign(app, {
  surfaceRaycaster: new THREE.Raycaster(), surfaceRayOrigin: new THREE.Vector3(),
  surfaceRayDirection: new THREE.Vector3(), surfaceRayFaceNormal: new THREE.Vector3(),
  surfaceRayNormalMatrix: new THREE.Matrix3(), surfaceRayInstanceMatrix: new THREE.Matrix4(),
  getAntGroundPosition: () => null,
});
function treeRoute(object) {
  const climb = new AntClimbing(app);
  object.updateWorldMatrix(true, true);
  // Match the generated tree: intersecting wood parts in one static mesh.
  const positions = [];
  const normals = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone())
      .applyMatrix4(child.matrixWorld);
    for (const value of geometry.attributes.position.array) positions.push(value);
    for (const value of geometry.attributes.normal.array) normals.push(value);
    geometry.dispose();
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  climb.route = {
    id: 'tree', configId: 'tree', kind: 'tree', center: new THREE.Vector3(),
    bounds: new THREE.Box3().setFromObject(surface), surfaces: [{ object: surface }],
  };
  return climb;
}
const wood = new THREE.Group();
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 64));
trunk.position.y = 1.5;
wood.add(trunk);
const remoteLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 12));
remoteLimb.position.set(2, 1.5, 0);
wood.add(remoteLimb);
const orbit = treeRoute(wood);
const contact = orbit.validateExteriorContact({
  position: new THREE.Vector3(0.5, 1.5, 0), normal: new THREE.Vector3(1, 0, 0), object: orbit.route.surfaces[0].object,
});
assert.ok(contact && contact.position.distanceTo(new THREE.Vector3(0.5, 1.5, 0)) < 0.001,
  'A distant limb along the normal must not invalidate exposed trunk bark.');
for (const sign of [-1, 1]) {
  orbit.surfacePoint.set(0.5, 1.5, 0);
  orbit.surfaceNormal.set(1, 0, 0);
  for (let step = 0; step < 340; step += 1) {
    const direction = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), orbit.surfaceNormal)
      .normalize().multiplyScalar(sign);
    const candidate = orbit.surfacePoint.clone().addScaledVector(direction, 0.01);
    const next = orbit.findAdjacentContact(candidate, direction, 0.01);
    assert.ok(next, `The ant must complete a trunk circuit in either direction, step ${step}.`);
    orbit.surfacePoint.copy(next.position);
    orbit.surfaceNormal.copy(next.normal);
  }
}
const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 24));
branch.rotation.z = Math.PI / 2;
branch.position.set(1.2, 1.5, 0);
wood.add(branch);
const junction = treeRoute(wood);
junction.surfacePoint.set(0.505, 1.62, 0);
junction.surfaceNormal.set(0, 1, 0);
junction.surfaceTangent.set(-1, 0, 0);
const direction = new THREE.Vector3(-1, 0, 0);
const next = junction.findAdjacentContact(
  junction.surfacePoint.clone().addScaledVector(direction, 0.01), direction, 0.01,
);
assert.ok(next && next.normal.x > 0.8,
  'Walking head-on along a branch must find the trunk wall without a sideways detour.');
assert.ok(next.position.distanceTo(junction.surfacePoint) < 0.04,
  'A junction transition must stay local rather than jump across the tree.');
const embedded = junction.validateExteriorContact({
  position: new THREE.Vector3(0.45, 1.62, 0), normal: new THREE.Vector3(0, 1, 0),
  object: junction.route.surfaces[0].object,
});
assert.equal(embedded, null, 'The branch surface buried inside the trunk must remain rejected.');
const innerLimb = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16));
innerLimb.position.set(0.45, 1.95, 0);
wood.add(innerLimb);
const overlapping = treeRoute(wood);
assert.equal(overlapping.validateExteriorContact({
  position: new THREE.Vector3(0.45, 1.62, 0), normal: new THREE.Vector3(0, 1, 0),
  object: overlapping.route.surfaces[0].object,
}), null, 'Another internal limb must not hide the enclosing trunk in an inside/outside query.');
const narrowWood = new THREE.Group();
const nearTrunk = trunk.clone();
narrowWood.add(nearTrunk);
const closeWood = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2));
closeWood.position.set(0.61, 1.5, 0);
narrowWood.add(closeWood);
const narrow = treeRoute(narrowWood);
assert.equal(narrow.validateExteriorContact({
  position: new THREE.Vector3(0.5, 1.5, 0), normal: new THREE.Vector3(1, 0, 0),
  object: narrow.route.surfaces[0].object,
}), null, 'An exposed contact must be rejected if the lifted ant pose would enter adjoining wood.');
const { createTree } = await importRuntime('../js/generators/tree.js');
// Canvas stubs retain the browser's numeric bark displacement without rendering.
const savedDocument = globalThis.document;
const savedPath = globalThis.Path2D;
const noop = () => {};
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
}, { get: (target, key) => target[key] ?? noop }) }) };
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} bezierCurveTo() {} quadraticCurveTo() {} };
const generated = createTree({ seed: 'ancient-oak', quality: 'high', age: 1.2, branchSpread: 1.3 });
globalThis.document = savedDocument;
globalThis.Path2D = savedPath;
for (const height of [0.8, 1.5, 2.5]) {
  const real = new AntClimbing(app);
  real.route = { id: 'tree', configId: 'tree', kind: 'tree', center: new THREE.Vector3(),
    bounds: new THREE.Box3().setFromObject(generated.woodMesh), surfaces: [{ object: generated.woodMesh }] };
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector / 16 * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const start = real.raycastRouteSurface(radial.clone().multiplyScalar(8).setY(height), radial.clone().negate());
    if (!start) continue;
    const point = start.position.clone();
    const normal = start.normal.clone();
    const checked = real.validateExteriorContact({ position: point, normal, object: generated.woodMesh });
    assert.ok(checked && checked.position.distanceTo(point) < 1e-7,
      `Exterior validation must preserve real bark contact at height ${height}, sector ${sector}.`);
    real.surfacePoint.copy(point);
    real.surfaceNormal.copy(normal);
    for (const sign of [-1, 1]) {
      const direction = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), real.surfaceNormal)
        .normalize().multiplyScalar(sign);
      const candidate = real.surfacePoint.clone().addScaledVector(direction, 0.006);
      const next = real.findAdjacentContact(candidate, direction, 0.006);
      assert.ok(next, `Generated bark must permit sideways movement: height ${height}, sector ${sector}, sign ${sign}.`);
    }
  }
}
// Regression near the reported x 0.441, z -0.324 vertical strip.
const reported = new AntClimbing(app);
reported.route = { id: 'tree', configId: 'tree', kind: 'tree', center: new THREE.Vector3(),
  bounds: new THREE.Box3().setFromObject(generated.woodMesh), surfaces: [{ object: generated.woodMesh }] };
const reportedRadial = new THREE.Vector3(0.441, 0, -0.324).normalize();
for (const height of [4, 4.156, 5]) {
  const reportedStart = reported.raycastRouteSurface(
    reportedRadial.clone().multiplyScalar(8).setY(height), reportedRadial.clone().negate(),
  );
  const startPoint = reportedStart.position.clone();
  const startNormal = reportedStart.normal.clone();
  for (const sign of [-1, 1]) {
    reported.surfacePoint.copy(startPoint);
    reported.surfaceNormal.copy(startNormal);
    for (let step = 0; step < 30; step += 1) {
      const direction = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), reported.surfaceNormal)
        .normalize().multiplyScalar(sign);
      const next = reported.findAdjacentContact(reported.surfacePoint.clone().addScaledVector(direction, 0.006), direction, 0.006);
      assert.ok(next, `Reported vertical strip: blocked at height ${height}, sign ${sign}, step ${step}.`);
      reported.surfacePoint.copy(next.position);
      reported.surfaceNormal.copy(next.normal);
    }
  }
}
assert.ok(generated.collisionBranches.every((branch) => branch.capStart && branch.capEnd),
  'Every wood tube must close both ends for reliable inside/outside classification.');
const trunkPart = generated.collisionBranches[0];
const trunkGeometry = generated.woodMesh.geometry.clone();
const trunkIndexCount = (trunkPart.points.length - 1) * 30 * 6
  + (trunkPart.capStart ? 30 * 3 : 0) + (trunkPart.capEnd === false ? 0 : 30 * 3);
trunkGeometry.setIndex(Array.from(trunkGeometry.index.array.slice(0, trunkIndexCount)));
const trunkEdges = new Map();
const trunkPositions = trunkGeometry.attributes.position;
const vertexKey = (index) => [trunkPositions.getX(index), trunkPositions.getY(index), trunkPositions.getZ(index)]
  .map((value) => Math.round(value * 1e6)).join(',');
for (let index = 0; index < trunkGeometry.index.count; index += 3) {
  const triangle = [0, 1, 2].map((corner) => vertexKey(trunkGeometry.index.getX(index + corner)));
  for (let edge = 0; edge < 3; edge += 1) {
    const key = [triangle[edge], triangle[(edge + 1) % 3]].sort().join('/');
    trunkEdges.set(key, (trunkEdges.get(key) ?? 0) + 1);
  }
}
assert.ok([...trunkEdges.values()].every((count) => count === 2),
  'The displaced main trunk must be closed across its seam and end caps.');
const trunkOnly = new THREE.Mesh(trunkGeometry, generated.woodMesh.material);
const circuit = new AntClimbing(app);
circuit.route = { id: 'tree', configId: 'tree', kind: 'tree', center: new THREE.Vector3(),
  bounds: new THREE.Box3().setFromObject(trunkOnly), surfaces: [{ object: trunkOnly }] };
for (const sign of [-1, 1]) {
  const initial = circuit.raycastRouteSurface(new THREE.Vector3(8, 1.5, 0), new THREE.Vector3(-1,0,0));
  circuit.surfacePoint.copy(initial.position);
  circuit.surfaceNormal.copy(initial.normal);
  let rotation = 0;
  for (let step = 0; step < 1600 && rotation < Math.PI * 2; step += 1) {
    const direction = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), circuit.surfaceNormal)
      .normalize().multiplyScalar(sign);
    const candidate = circuit.surfacePoint.clone().addScaledVector(direction, 0.006);
    const angle = Math.atan2(circuit.surfacePoint.z, circuit.surfacePoint.x);
    const next = circuit.findAdjacentContact(candidate, direction, 0.006);
    assert.ok(next, `Displaced trunk circuit stuck: sign ${sign}, step ${step}, position ${circuit.surfacePoint.toArray()}.`);
    circuit.surfacePoint.copy(next.position);
    circuit.surfaceNormal.copy(next.normal);
    const delta = Math.atan2(circuit.surfacePoint.z, circuit.surfacePoint.x) - angle;
    rotation += Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  }
  assert.ok(rotation >= Math.PI * 2, 'Displaced trunk must allow a complete circuit.');
}
trunkGeometry.dispose();
generated.group.userData.dispose();
const solidMesh = app.surfaceBackfaceMesh;
assert.ok(solidMesh && solidMesh.material.side === THREE.DoubleSide);
assert.equal(junction.route.surfaces[0].object.material.side, THREE.FrontSide,
  'Inside/outside queries must preserve the rendered wood material.');
solidMesh.material.dispose();
console.log('Climb surface checks passed: complete trunk circuits, exposed bark beside other limbs, head-on branch/trunk transfer, overlapping-wood containment, lifted-pose clearance, and sampled generated bark movement.');
