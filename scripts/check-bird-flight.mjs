import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { BirdFlight, isBirdRewardUnlocked } from '../js/game/bird-flight.js';
import { FlightCollisionWorld, moveFlightSphere } from '../js/core/flight-collision.js';
import { BIRD_FLIGHT_CONFIG } from '../js/config/bird.js';
import { stepFlightMotion } from '../js/utils/flight-motion.js';
import { PondGameSession } from '../js/game/game-session.js';
import { createTree } from '../js/generators/tree.js';
import { DEFAULTS } from '../js/config/index.js';

assert.equal(isBirdRewardUnlocked(null), false);
assert.equal(isBirdRewardUnlocked({ completed: 0, total: 0 }), false);
assert.equal(isBirdRewardUnlocked({ completed: 11, total: 12 }), false);
assert.equal(isBirdRewardUnlocked({ completed: 12, total: 12 }), true);

const obstacles = new THREE.Group();
const wall = new THREE.Mesh(new THREE.BoxGeometry(0.01, 12, 12));
obstacles.add(wall);
const collision = new FlightCollisionWorld();
collision.addObject(wall);
const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 2, 1), new THREE.MeshBasicMaterial(), 1);
instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(5, 1, 0));
obstacles.add(instanced);
collision.addObject(instanced);
const branchSource = new THREE.Group();
branchSource.position.x = 8;
obstacles.add(branchSource);
collision.addBranches(branchSource, [{
  points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4, 0)],
  radii: [0.2, 0.1],
}]);
const taperedSource = new THREE.Group();
taperedSource.position.x = 12;
obstacles.add(taperedSource);
collision.addBranches(taperedSource, [{
  points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 0)],
  radii: [0.5, 0.02],
}]);
await collision.build();
assert.equal(collision.intersectsSphere(new THREE.Vector3(-0.3, 0, 0), 0.4), true);
assert.equal(collision.intersectsSphere(new THREE.Vector3(-0.6, 0, 0), 0.4), false);
assert.equal(collision.intersectsSphere(new THREE.Vector3(5.3, 1, 0), 0.2), true, 'Instanced obstacles use their instance transforms.');
assert.equal(collision.intersectsSphere(new THREE.Vector3(8.3, 2, 0), 0.2), true, 'Tree capsules block their transformed branch volumes.');
assert.equal(collision.intersectsSphere(new THREE.Vector3(8.9, 2, 0), 0.2), false);
assert.equal(collision.intersectsSphere(new THREE.Vector3(12.55, 2.8, 0), 0.2), false,
  'The thin end of a branch must not inherit the thick base radius.');
const candidate = new THREE.Vector3();
const sphere = new THREE.Vector3(-2, 0, 0);
let idleQueries = 0;
moveFlightSphere(sphere, new THREE.Vector3(), 0.4, () => { idleQueries += 1; return true; }, candidate);
assert.equal(idleQueries, 0, 'A stationary bird skips swept collision queries.');
moveFlightSphere(sphere, new THREE.Vector3(5, 0, 1), 0.4,
  (position) => !collision.intersectsSphere(position, 0.4), candidate);
assert.ok(sphere.x < -0.4, 'A large step cannot tunnel through a thin wall.');
assert.ok(sphere.z > 0.9, 'Flight keeps safe tangential movement beside a wall.');

const actualTree = createTree({ ...DEFAULTS, leafDensity: 0.4 });
const treeCollision = new FlightCollisionWorld();
treeCollision.addBranches(actualTree.woodMesh, actualTree.collisionBranches);
await treeCollision.build();
const woodPositions = actualTree.woodMesh.geometry.attributes.position;
const woodPoint = new THREE.Vector3();
for (let index = 0; index < woodPositions.count; index += 13) {
  woodPoint.fromBufferAttribute(woodPositions, index).applyMatrix4(actualTree.woodMesh.matrixWorld);
  assert.ok(treeCollision.intersectsSphere(woodPoint, 0.002),
    `The tighter collider must still cover sampled visible wood at vertex ${index}.`);
}
treeCollision.dispose();
actualTree.group.userData.dispose();

// A capped turn rotates the travel direction itself, producing a curved path.
const makeMotion = () => ({ axes: {}, yaw: 0, speed: 0, verticalSpeed: 0, pitch: 0, bank: 0 });
const motion = makeMotion();
const input = { keys: new Set(['forward']), x: 0, y: 0 };
const forward = new THREE.Vector3(0, -BIRD_FLIGHT_CONFIG.camera.height, BIRD_FLIGHT_CONFIG.camera.distance).normalize();
const displacement = new THREE.Vector3();
for (let i = 0; i < 90; i++) stepFlightMotion(motion, input, forward, BIRD_FLIGHT_CONFIG, 1 / 90, displacement);
input.keys.clear();
input.keys.add('right');
const previousYaw = motion.yaw;
stepFlightMotion(motion, input, forward, BIRD_FLIGHT_CONFIG, 1 / 90, displacement);
assert.ok(Math.abs(motion.yaw - previousYaw) <= BIRD_FLIGHT_CONFIG.maximumTurnRate / 90 + 1e-8);
assert.ok(displacement.z > 0, 'A new sideways input keeps moving along the beginning of the curve.');
assert.ok(Math.abs(motion.bank) > 0, 'Turning banks the bird.');

const simulate = (fps) => {
  const state = makeMotion();
  const position = new THREE.Vector3();
  const controls = { keys: new Set(['forward']), x: 0, y: 0 };
  for (let frame = 0; frame < fps * 3; frame += 1) {
    if (frame === fps) { controls.keys.clear(); controls.keys.add('right'); }
    let remaining = 1 / fps;
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, BIRD_FLIGHT_CONFIG.simulationStep);
      stepFlightMotion(state, controls, forward, BIRD_FLIGHT_CONFIG, dt, displacement);
      position.add(displacement);
      remaining -= dt;
    }
  }
  return position;
};
assert.ok(simulate(20).distanceTo(simulate(60)) < 0.06, 'Low/Mid and uncapped frame cadences follow similar curves.');

// Parse the actual model without its textures so geometry and animation run in Node.
const original = fs.readFileSync(new URL('../assets/models/bird_fly.glb', import.meta.url));
const jsonSize = original.readUInt32LE(12);
const gltfJson = JSON.parse(original.subarray(20, 20 + jsonSize).toString());
gltfJson.materials = gltfJson.materials.map(() => ({}));
gltfJson.images = [];
gltfJson.textures = [];
const json = Buffer.from(JSON.stringify(gltfJson));
const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const binary = original.subarray(20 + jsonSize);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + paddedJson.length + binary.length, 8);
header.writeUInt32LE(paddedJson.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const glb = Buffer.concat([header, paddedJson, binary]);
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const modelGroup = new THREE.Group();
modelGroup.add(gltf.scene);
const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
const camera = new THREE.PerspectiveCamera();
const frameCallbacks = new Set();
let birdModelLoads = 0;
const app = {
  modelProps: {},
  loadDeferredModel: async () => {
    birdModelLoads += 1;
    app.modelProps.bird = { group: modelGroup, animations: gltf.animations };
    return app.modelProps.bird;
  },
  settings: { area: 'pond' },
  ground: { heightAt: () => 0, containsPond: () => false },
  activePondWater: null,
  readerCollisionBounds: new THREE.Box3().makeEmpty(),
  camera,
  controls: { target: new THREE.Vector3() },
  addWorldObject: (object) => world.add(object),
  removeWorldObject: (object) => object.removeFromParent(),
  getFlightCollisionSources: () => [],
  getAntWorldPosition: (target) => target.set(0, 0.17, 0),
  onFrame: (callback) => {
    frameCallbacks.add(callback);
    return () => frameCallbacks.delete(callback);
  },
  setFlyingActorView: (position, target) => {
    camera.position.copy(position);
    app.controls.target.copy(target);
  },
};
const bird = new BirdFlight(app, BIRD_FLIGHT_CONFIG);
assert.equal(birdModelLoads, 0, 'Constructing the controller does not load the bird model.');
await bird.start();
await bird.start();
assert.equal(birdModelLoads, 1, 'Preparation reuses the loaded model.');
assert.equal(modelGroup.parent, null, 'A prepared but inactive bird is absent from the scene.');
assert.equal(frameCallbacks.size, 0, 'An inactive bird has no frame callback.');
assert.equal(bird.action.timeScale, 1.5);
assert.ok(Number.isFinite(bird.radius) && bird.radius > 0.3 && bird.radius < 1.5);
assert.ok(bird.action.getClip().tracks.every((track) => !/^Bone_01\.(position|quaternion|scale)$/.test(track.name)));
assert.ok(bird.activate(), 'The real model can spawn in open air.');
assert.equal(frameCallbacks.size, 1);
modelGroup.updateWorldMatrix(true, true);
const bodyRoot = modelGroup.getObjectByName('Bone_01');
const bodyDirection = bodyRoot.children[0].getWorldPosition(new THREE.Vector3())
  .sub(bodyRoot.getWorldPosition(new THREE.Vector3()));
assert.ok(bodyDirection.z > 0, 'The authored bird forward axis matches the flight heading.');
app.readerCollisionBounds.setFromCenterAndSize(bird.position, new THREE.Vector3(1, 2, 1));
assert.equal(bird.isPositionClear(bird.position), false, 'The moving reader bounds block flight.');
app.readerCollisionBounds.makeEmpty();
const originalPosition = bird.position.clone();
bird.setMovementKey('down', true);
for (let i = 0; i < 180; i++) bird.update({ delta: 1 / 30 });
assert.ok(bird.position.y >= bird.radius + BIRD_FLIGHT_CONFIG.minimumGroundClearance - 1e-6);
assert.ok(bird.position.y < originalPosition.y, 'Descending works until minimum clearance.');
bird.clearInput();
app.ground.heightAt = (_x, z) => Math.max(0, z) * 0.2;
bird.position.set(0, 0, 0);
bird.position.y = bird.getMinimumHeight(bird.position);
bird.motion.yaw = 0;
bird.resetCamera();
bird.setMovementKey('forward', true);
bird.setMovementKey('down', true);
for (let i = 0; i < 60; i++) bird.update({ delta: 1 / 60 });
assert.ok(bird.position.z > 1, 'Minimum clearance follows rising terrain instead of becoming an invisible wall.');
assert.ok(bird.position.y >= bird.getMinimumHeight(bird.position) - 1e-6);
app.ground.heightAt = () => 0;
bird.clearInput();
const pausedPosition = bird.position.clone();
bird.setPaused(true);
assert.equal(frameCallbacks.size, 0, 'Paused flight has no frame callback.');
bird.setMovementKey('forward', true);
bird.update({ delta: 1 / 20 });
assert.ok(bird.position.equals(pausedPosition), 'Pause stops bird movement.');
bird.setPaused(false);
assert.equal(frameCallbacks.size, 1);
assert.equal(bird.input.keys.size, 0, 'Resume requires fresh input.');
bird.setMovementKey('forward', true);
bird.setSuspended(true);
assert.equal(frameCallbacks.size, 1, 'Explore keeps the animation callback while a bird is visible.');
const wingTime = bird.action.time;
const cameraBeforeExplore = camera.position.clone();
const targetBeforeExplore = app.controls.target.clone();
const collisionQueries = bird.collision.intersectsSphere.bind(bird.collision);
let exploreCollisionQueries = 0;
bird.collision.intersectsSphere = (...args) => { exploreCollisionQueries += 1; return collisionQueries(...args); };
bird.update({ delta: 1 / 20 });
assert.ok(bird.position.equals(pausedPosition), 'Explore suspends bird movement.');
assert.ok(bird.action.time > wingTime, 'The wings keep flapping in Explore.');
assert.ok(camera.position.equals(cameraBeforeExplore), 'Explore leaves the free camera alone.');
assert.ok(app.controls.target.equals(targetBeforeExplore));
assert.equal(exploreCollisionQueries, 0, 'Explore runs animation without flight collision work.');
bird.collision.intersectsSphere = collisionQueries;
bird.setSuspended(false);
bird.setMovementKey('forward', true);
for (let i = 0; i < 30; i++) bird.update({ delta: 1 / 20 });
assert.ok(bird.position.distanceTo(pausedPosition) > 1, 'The capped profile can move the bird.');
bird.setMovementAxes(1, 1);
bird.deactivate();
assert.equal(modelGroup.parent, null, 'Ant play does not traverse a hidden bird skeleton.');
assert.equal(frameCallbacks.size, 0, 'Returning to the ant removes all bird frame callbacks.');
assert.equal(bird.model.group.visible, false);
assert.equal(bird.input.keys.size, 0);
assert.equal(bird.input.x, 0);

// Exercise the session switch while the ant is mounted, without a renderer or DOM.
const session = new PondGameSession(null);
let completed = 11;
let antLocked = true;
let view = 'ant';
let antSuspended = false;
session.app = {
  clearAntMovement() {},
  setAntMotionLocked: (locked) => { antLocked = locked; },
  isAntFlightEnabled: () => false,
  setView: (name) => { view = name; },
  setExploreTouchMode() {},
  setAntLocatorActive() {},
};
session.bird = bird;
session.climbing = { isClimbing: () => true, clearMovementInput() {}, setExploreActive() {}, setPaused() {} };
session.game = { setExploreActive: (active) => { antSuspended = active; }, setPaused() {} };
session.objectives = { getSnapshot: () => ({ completed, total: 12 }), setPaused() {} };
assert.equal(session.canPlayBird(), false);
assert.equal(await session.toggleBird(), false, 'Unfinished objectives keep normal play locked.');
completed = 12;
assert.equal(session.canPlayBird(), true);
assert.equal(await session.toggleBird(), true);
assert.equal(session.isBirdActive(), true);
assert.equal(antLocked, true);
assert.equal(antSuspended, true);
assert.equal(await session.toggleBird(), true);
assert.equal(session.isBirdActive(), false);
assert.equal(view, 'ant');
assert.equal(antLocked, true, 'A mounted ant retains its surface lock on return.');
assert.equal(antSuspended, false);
assert.equal(session.climbing.isClimbing(), true, 'Switching does not dismount the ant.');
bird.dispose();
collision.dispose();
console.log('Bird flight checks passed: reward gate, real model/animation, curved turns, banking, swept collisions, sliding, ground clearance, pause, Explore, and input reset.');
