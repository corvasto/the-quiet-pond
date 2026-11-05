import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSurfaceChamber } from '../js/generators/surface-chamber.js';
import { createUndergroundLayout } from '../js/content/underground-layout.js';
import { createUnderground } from '../js/generators/underground.js';
import { SURFACE_TERRAIN, BURROW_CONFIG } from '../js/config/content.js';
import { installPondCameraMethods, resolveChamberCameraOffset } from '../js/core/app-camera.js';
import { PondGameSession } from '../js/game/game-session.js';
import { renderUndergroundMap } from '../js/ui/underground-map.js';
import { BurrowBuilding } from '../js/game/burrow-building.js';
import { createBurrowVisual, SeedToBurrowGame } from '../js/game/seed-to-burrow.js';
import { installPondAntNavigationMethods } from '../js/core/app-ant-navigation.js';
import { SCENE_PROPS } from '../js/config/index.js';

class CameraHarness {}
installPondCameraMethods(CameraHarness);
class NavigationHarness {}
installPondAntNavigationMethods(NavigationHarness);
for (const segments of [70, 120]) {
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(30, 30, segments, segments));
  terrain.geometry.rotateX(-Math.PI / 2);
  const config = SURFACE_TERRAIN, chamber = config.chamber;
  const x = chamber.x, door = chamber.z - chamber.length / 2, mouth = door - chamber.rampLength;
  const layout = createUndergroundLayout({ origin: { x, z: door + 0.65 * 1.5 },
    entranceClearance: chamber.passageWidth / 2 + 0.12 });
  const level = createUnderground({ layout, rootExtension: config.rootExtension });
  const c = createSurfaceChamber({ config: { ...config, level }, terrain, heightAt: () => 0.2 });
  const z = layout.landmarks.nest.z, floor = layout.heightAt(x, z);
  const half = chamber.doorwayWidth / 2;
  assert.ok(Math.abs(mouth - (BURROW_CONFIG.position.z - 0.24)) < 1e-8);
  const p = terrain.geometry.attributes.position;
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
    const d = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const cx = (a.x + b.x + d.x) / 3, cz = (a.z + b.z + d.z) / 3;
    const r = chamber.cornerRadius;
    const dx = Math.max(0, Math.abs(cx - x) - (half - r));
    const dz = Math.max(0, Math.abs(cz - mouth - chamber.openingLength / 2) - (chamber.openingLength / 2 - r));
    assert.ok(Math.hypot(dx, dz) >= r * Math.cos(Math.PI / 24) - 1e-5, 'Rounded opening contains no terrain triangles');
    area += Math.abs((b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x)) / 2;
  }
  assert.ok(Math.abs(area - (900 - chamber.doorwayWidth * chamber.openingLength + (4 - 12 * Math.sin(Math.PI / 12)) * chamber.cornerRadius ** 2)) < 1e-4);
  const navigation = new NavigationHarness();
  navigation.ant = { group: new THREE.Group() };
  navigation.ant.group.position.set(3.8, 0.24, -2.8);
  navigation.ground = { chamber: c, heightAt: c.surfaceHeightAt, containsRock: () => false };
  navigation.antMovementCenter = new THREE.Vector2(); navigation.antMovementRadius = 24;
  navigation.treeGroundColliders = [{ x: 0, z: 0, radius: 0.5 }]; navigation.modelGroundColliders = [];
  assert.ok(!c.canMove(navigation.ant.group.position, x, mouth + chamber.openingLength - 0.01, 0.075),
    'The old movement-based location check reproduces the startup rejection');
  assert.equal(navigation.canAntOccupy(BURROW_CONFIG.position.x, BURROW_CONFIG.position.z), true,
    'Burrow location remains valid independently of the ant spawn height');
  assert.equal(navigation.moveAntTo(x, mouth + chamber.openingLength - 0.01), false,
    'Walking still rejects a large unsupported step');
  assert.equal(navigation.moveAntTo(BURROW_CONFIG.position.x, BURROW_CONFIG.position.z, { validatePath: false }), true,
    'Explicit relocation can use a valid destination without a walking step restriction');
  for (const dz of [-0.01, 0.01]) {
    navigation.ant.group.position.set(-2.833, -0.268, -3.583);
    assert.equal(navigation.moveAntTo(-2.833, -3.583 + dz), true,
      'The reported stuck position can move both uphill and downhill');
  }
  for (let trip = 0; trip < 2; trip++) {
    navigation.ant.group.position.set(x, layout.heightAt(x, door + 0.2) + SCENE_PROPS.ant.lift, door + 0.2);
    for (let at = door + 0.19; at > mouth - 0.15; at -= 0.01) {
      const previousY = navigation.ant.group.position.y;
      assert.ok(navigation.moveAntTo(x, at), `Exit stays traversable at ${at}`);
      assert.ok(Math.abs(navigation.ant.group.position.y - previousY) < 0.08, 'Exit cannot snap the ant to another floor');
    }
    assert.ok(!c.below(navigation.ant.group.position));
  }
  let lights = 0; level.group.traverse((object) => { if (object.isLight) lights++; });
  assert.equal(lights, 0, 'Underground fill cannot illuminate surface objects');
  const root = level.group.getObjectByName('Curved tree taproot');
  assert.equal(root.material.color.getHexString(), '75502f', 'Bark detail preserves the root color');
  assert.ok(root.material.bumpMap?.image.data.length > 0);
  assert.ok(new Set(root.material.bumpMap.image.data).size > 10, 'Bark bump map has surface detail');
  root.geometry.computeBoundingBox();
  assert.ok(root.geometry.boundingBox.max.y > layout.roofAt(0, 0) + 0.6);
  assert.ok(root.geometry.boundingBox.min.y < layout.heightAt(0, 0) - 0.5);
  assert.ok(level.group.getObjectByName('Solid soil behind tunnel walls'));
  assert.ok(c.group.getObjectByName('Covered burrow ramp shell'));
  c.group.updateMatrixWorld(true);
  for (const atZ of [mouth + chamber.openingLength + 0.01, mouth + 1, door - 0.005, door + 0.005]) {
    for (const dx of [-0.12, 0, 0.12]) {
      const floorY = c.supportHeight(x + dx, atZ, -1.2);
      const ray = new THREE.Raycaster(new THREE.Vector3(x + dx, floorY + 0.2, atZ), new THREE.Vector3(0, 1, 0), 0, 2);
      assert.ok(ray.intersectObject(c.group, true).length, 'Ceiling geometry seals the ramp and room join');
    }
  }
  const overhead = new THREE.Raycaster(new THREE.Vector3(x, 5, mouth + 1), new THREE.Vector3(0, -1, 0));
  assert.ok(overhead.intersectObject(terrain).length, 'Surface remains above the covered descent');
  assert.equal(c.surfaceHeightAt(x, mouth + 1), 0.2);
  for (let d = 0.01; d < chamber.rampLength; d += 0.01) {
    const a = mouth + d, b = a + 0.005, y = c.supportHeight(x, a, -1.2) + 0.04;
    assert.ok(c.canMove({ x, y, z: a }, x, b, 0.075), 'Entire covered descent is traversable');
    assert.ok(c.canMove({ x, y, z: b }, x, a, 0.075));
    if (c.below({ x, y, z: a }) && d < chamber.rampLength - 0.1) {
      const target = new THREE.Vector3(x, y + 0.15, a);
      const camera = new THREE.PerspectiveCamera();
      c.setPassageCamera({ x, y, z: a }, camera, target);
      assert.ok(Number.isFinite(camera.position.y));
      assert.ok(c.containsCamera(camera.position.x, camera.position.y, camera.position.z), 'Fixed passage camera stays in the tunnel');

    }
  }
  for (const point of Object.values(layout.landmarks)) {
    assert.equal(c.supportHeight(point.x, point.z, 0.3), 0.2, 'Surface stays walkable above each chamber');
    assert.equal(c.supportHeight(point.x, point.z, -1), layout.heightAt(point.x, point.z));
    assert.ok(c.containsCamera(point.x, layout.heightAt(point.x, point.z) + 0.3, point.z));
    assert.ok(!c.containsCamera(point.x, layout.roofAt(point.x, point.z) + 0.1, point.z));
  }
  for (let t = -0.2; t < 0.2; t += 0.01) {
    const a = door + t, b = a + 0.01, y = c.supportHeight(x, a, -1) + 0.04;
    assert.ok(c.canMove({ x, y, z: a }, x, b, 0.075), `Passage enters continuously: ${a}, ${y}, next ${c.supportHeight(x,b,y)}, source ${c.supportHeight(x,a,y)}`);
    assert.ok(c.canMove({ x, y, z: b }, x, a, 0.075));
  }
  assert.ok(!c.canMove({ x, y: floor + 0.04, z }, x - 15, z, 0.075));
  const plant = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), new THREE.MeshBasicMaterial(), 1);
  const pose = new THREE.Object3D(); pose.position.set(x + 0.4, 0.2, mouth + 0.4);
  pose.rotation.set(0.3, 0.7, 1.1); pose.updateMatrix(); plant.setMatrixAt(0, pose.matrix);
  c.adjustDecorations([plant]);
  for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) assert.equal(plant.instanceMatrix.array[index], 0);
  assert.equal(c.surfaceHeightAt(0, 0), 0.2);
  assert.ok(c.surfaceHeightAt(-12, -10) > 0.2);
  assert.ok(c.surfaceHeightAt(-10, -11.5) < 0.2);
  const app = new CameraHarness();
  app.ant = { group: new THREE.Group() };
  app.ant.group.position.set(x, floor + 0.04, z);
  app.ground = { chamber: c };
  app.camera = new THREE.PerspectiveCamera();
  app.controls = { target: new THREE.Vector3(x, floor + 0.19, z), update() {
    const offset = new THREE.Vector3().subVectors(app.camera.position, this.target);
    if (offset.length() < 1.3) app.camera.position.copy(this.target).add(offset.setLength(1.3));
  } };
  app.camera.position.copy(app.controls.target).add(new THREE.Vector3(1.8, 0.2, 0));
  app.antCameraAnchor = new THREE.Vector3(); app.antCameraLastPosition = new THREE.Vector3();
  app.antCameraDelta = new THREE.Vector3();
  app.antCameraFollow = { enabled: true, followFacing: true };
  app.isAntViewActive = () => true;
  app.getAntWorldPosition = (target) => target.copy(app.ant.group.position);
  app.updateAntCamera(1 / 60);
  const corrected = app.camera.position.clone();
  const requested = app.chamberCameraRequestedOffset.clone();
  for (let frame = 0; frame < 240; frame++) app.updateAntCamera(1 / 60);
  assert.ok(app.camera.position.distanceTo(corrected) < 1e-8, 'Idle camera stays stable despite controls minimum distance');
  assert.ok(app.chamberCameraRequestedOffset.distanceTo(requested) < 1e-8, 'Collision preserves requested orbit');
  app.ant.group.rotation.y = 0.7 + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
  app.resetAntCameraView();
  const resetOrbit = app.chamberCameraRequestedOffset.clone();
  assert.ok(resetOrbit.x < 0 && resetOrbit.z < 0, 'Reset faces the ant forward');
  for (let frame = 0; frame < 90; frame++) app.updateAntCamera(1 / 60);
  assert.ok(app.chamberCameraRequestedOffset.distanceTo(resetOrbit) < 1e-8, 'Reset is not replaced by the previous orbit');
  app.ant.group.position.set(x, c.supportHeight(x, mouth + 0.55, -1.2) + 0.04, mouth + 0.55);
  app.controls.target.copy(app.ant.group.position); app.controls.target.y += 0.15;
  app.chamberCameraRequestedOffset = new THREE.Vector3(2, 0.3, 0);
  const yaw = app.antCameraMovementYaw ?? 0;
  for (let frame = 0; frame < 120; frame++) app.updateAntCamera(1 / 60);
  assert.ok(Math.abs(app.antCameraMovementYaw - yaw) < 1e-8, 'Shoulder correction must not repeatedly rotate held movement');
  app.ant.group.position.set(x, floor + 0.04, z);
  const session = Object.create(PondGameSession.prototype);
  session.app = { ...app, clearAntMovement() {}, setAntMotionLocked(value) { this.antMotionLocked = value; } };
  session.app.ground.chamber = c; session.burrowLevel = level;
  session.app.getAntWorldPosition = (target) => target.copy(app.ant.group.position);
  session.debugPosition = new THREE.Vector3(); session.emitPrompt = () => {};
  session.isBirdActive = () => false;
  assert.ok(session.isBelowGround());
  const data = session.getUndergroundMapData();
  assert.equal(data.layout.cells.length, layout.cells.length);
  assert.deepEqual(data.position, { x, z });
  const svg = renderUndergroundMap(data, (key) => key);
  assert.ok(svg.includes('underground-map__player')); assert.ok(svg.includes('underground.map.ramp'));
  session.setExploreActive(true);
  assert.ok(session.app.antMotionLocked); assert.equal(session.app.controls.enabled, false);
  session.setExploreActive(false);
  assert.equal(session.app.antMotionLocked, false); assert.equal(session.app.controls.enabled, true);
  session.savePosition = new THREE.Vector3(); session.saveFacing = new THREE.Vector3();
  session.app.getAntFacingDirection = (target) => target.set(0, 0, 1);
  session.objectives = { getSaveState: () => ({}), setPaused() {} };
  session.game = { getSaveState: () => ({}), setPaused() {} };
  session.emitGameState = () => {};
  const saved = session.getSaveState();
  assert.equal(saved.underground.mode, 'in-world'); assert.equal(saved.underground.active, true);
  session.app.setAntPose = (p) => session.app.ant.group.position.copy(p);
  session.app.setView = () => {};
  assert.equal(await session.restoreUndergroundCheckpoint(saved.underground), true);
  assert.ok(session.isBelowGround());
  assert.equal(session.restoringUndergroundCheckpoint, false);
  await session.restoreUndergroundCheckpoint({ active: true, position: { x, z: mouth + 0.7 }, heading: 0 });
  assert.ok(Math.abs(session.app.ant.group.position.z - mouth - 0.7) < 1e-8, 'A ramp checkpoint does not teleport to a chamber');
  session.app.ant.group.position.set(x, floor + 0.04, z);
  const building = Object.create(BurrowBuilding.prototype);
  building.session = session; building.app = session.app;
  Object.defineProperty(building, 'grounded', { value: true });
  building.state = { items: [{ id: 1, state: 'loose', area: 'burrow', type: 'stick', x, z }] };
  building.meshes = new Map([[1, { position: { y: 0.2 } }]]);
  assert.equal(building.nearestMaterial(), undefined, 'Cannot pick a material through the ceiling');
  building.meshes.get(1).position.y = floor + 0.025;
  assert.equal(building.nearestMaterial().id, 1);
  building.state.items[0].area = 'surface';
  assert.equal(building.nearestMaterial(), undefined, 'Surface materials stay inaccessible from below');
  session.game.phase = 'discovering';
  session.game.activeSeeds = [{ area: 'surface', position: new THREE.Vector3(x, 0.2, z) }];
  assert.equal(building.nearestSeed(), undefined, 'Surface seeds stay inaccessible from below');
  session.game.activeSeeds[0].area = 'burrow';
  assert.equal(building.nearestSeed(), undefined, 'Seed pickup also checks vertical distance');
  session.game.activeSeeds[0].position.y = floor + 0.05;
  assert.ok(building.nearestSeed());
  const quiet = layout.landmarks.quiet;
  const rightEdge = layout.pointAt(10, 17).x + layout.cellSize / 2;
  session.app.ant.group.position.set(rightEdge - 0.1, layout.heightAt(rightEdge - 0.1, quiet.z) + 0.04, quiet.z);
  session.app.ant.group.rotation.y = -Math.PI / 2 + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
  building.candidate = new THREE.Vector3(); building.facing = new THREE.Vector3();
  building.state.items = []; building.state.builds = []; building.state.carried = { type: 'leaf' };
  assert.equal(building.placement(), null, 'A carried leaf can drop on a clear landing while the ant stands near a wall');
  level.dispose();
}
const entranceRay = new THREE.Raycaster(new THREE.Vector3(0, 0.08, -1), new THREE.Vector3(0, 0, 1), 0, 2);
const openBurrow = createBurrowVisual(); openBurrow.updateMatrixWorld(true);
assert.equal(entranceRay.intersectObject(openBurrow.userData.rockPieces, true).length, 0, 'Rear rock leaves the entrance clear');
let movementClears = 0;
const gamePause = Object.create(SeedToBurrowGame.prototype);
gamePause.app = { clearAntMovement: () => movementClears++ }; gamePause.setPrompt = () => {};
gamePause.setPaused(true, { preserveMovement: true });
assert.equal(movementClears, 0, 'Crossing the entrance preserves a held movement key');
gamePause.setPaused(true);
assert.equal(movementClears, 1, 'Explicit pause still clears movement');
console.log('Underground checks passed: exit traversal, ramp saves, persistent reset, camera/input stability, map, drops, and textured roots.');
