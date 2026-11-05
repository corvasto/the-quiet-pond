import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.module.js';
import { SCENE_PROPS } from '../js/config/index.js';
import { ANT_CAMERA_FOLLOW_CONFIG, ANT_MOVEMENT_CONFIG } from '../js/config/world.js';
import {
  shouldTouchRun,
  clampMotionDelta,
  clampMovementAxis,
  resolveMovementAxes,
  stepPlanarMotion,
} from '../js/utils/player-motion.js';

assert.equal(shouldTouchRun(0.89, false, true), false);
assert.equal(shouldTouchRun(0.9, false, true), true);
assert.equal(shouldTouchRun(0.8, true, true), true, 'Hysteresis avoids rapid switching.');
assert.equal(shouldTouchRun(0.76, true, true), false);
assert.equal(shouldTouchRun(1, true, false), false, 'Climbing and flight cannot trigger running.');

// Resolve the same vendored Three.js used by the HTML import map, without a
// browser, package installation, or changes to the runtime module bodies.
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

const { installPondAntNavigationMethods } = await importRuntime('../js/core/app-ant-navigation.js');
const { installPondCameraMethods } = await importRuntime('../js/core/app-camera.js');
const { AntClimbing } = await importRuntime('../js/game/ant-climbing.js');

const near = (actual, expected, tolerance = 1e-10) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `Expected ${actual} to be within ${tolerance} of ${expected}`,
);

const axes = {};
resolveMovementAxes(axes, 0, 0, 0.08, 0.08, 0.12);
near(axes.magnitude, 0);
resolveMovementAxes(axes, 0, 0, 0, 0.56, 0.12);
near(axes.y, 0.5);
resolveMovementAxes(axes, 1, 1, -1, 0, 0.12);
near(Math.hypot(axes.x, axes.y), 1);
assert.ok(axes.x > 0 && axes.y > 0, 'Keyboard direction must override analog input.');
for (const invalid of [NaN, Infinity, -Infinity, '1', undefined]) near(clampMovementAxis(invalid), 0);
near(clampMovementAxis(2), 1);
near(clampMovementAxis(-2), -1);
near(clampMotionDelta(4), 0.05);
near(clampMotionDelta(-1), 0);
near(clampMotionDelta(NaN), 0);

function integrate(rate, targetX, targetZ, initialX = 0) {
  const velocity = { x: initialX, z: 0 };
  const displacement = {};
  let x = 0;
  let z = 0;
  for (let frame = 0; frame < rate; frame += 1) {
    stepPlanarMotion(velocity, displacement, targetX, targetZ, 18, 26, 1 / rate);
    x += displacement.x;
    z += displacement.z;
  }
  return { x, z, velocity };
}

const reference = integrate(60, 0.29, 0);
for (const rate of [20, 30, 120, 144]) near(integrate(rate, 0.29, 0).x, reference.x);
const diagonal = integrate(60, 0.29 / Math.SQRT2, 0.29 / Math.SQRT2);
near(Math.hypot(diagonal.x, diagonal.z), reference.x);
near(integrate(60, 0.145, 0).x, reference.x * 0.5);
const braking = integrate(60, 0, 0, 0.29);
assert.ok(braking.x < 0.012 && braking.velocity.x === 0, 'Release should stop in roughly one hundredth of a world unit.');
const velocity = { x: 0.29, z: 0 };
const displacement = {};
stepPlanarMotion(velocity, displacement, -0.29, 0, 18, 26, 0.05);
assert.ok(velocity.x < 0, 'Reversing direction should reverse velocity within 50 ms.');

class NavigationHarness {
  constructor() {
    this.activeView = 'ant';
    this.ant = { group: new THREE.Group() };
    this.world = new THREE.Group();
    this.world.add(this.ant.group);
    this.ant.group.rotation.y = Math.PI * 0.5;
    this.antMovement = ANT_MOVEMENT_CONFIG;
    this.antMovementInput = new Set();
    this.antMovementAxes = new THREE.Vector2();
    this.antResolvedAxes = { x: 0, y: 0, magnitude: 0 };
    this.antVelocity = new THREE.Vector3();
    this.antDisplacement = new THREE.Vector3();
    this.antForward = new THREE.Vector3();
    this.antRight = new THREE.Vector3();
    this.antMoveDirection = new THREE.Vector3();
    this.camera = new THREE.PerspectiveCamera();
    this.camera.position.set(0, 0.6, 0.9);
    this.controls = { target: new THREE.Vector3(), update() {} };
    this.ground = { heightAt: () => 0, containsPond: () => false };
    this.canAntOccupy = () => true;
  }

  setAntAnimationPlaying(value) { this.animationPlaying = value; }
  setAntRunning(value) { this.antRunEnabled = value; }
  getAntWorldPosition(target) { return this.ant.group.getWorldPosition(target); }
}
installPondAntNavigationMethods(NavigationHarness);
installPondCameraMethods(NavigationHarness);

const straight = new NavigationHarness();
straight.setAntMovementKey('forward', true);
straight.updateAntMovement(1 / 60);
near(straight.ant.group.position.x, 0);
assert.ok(straight.ant.group.position.z < 0, 'Travel must immediately follow the camera despite the initial body yaw.');
straight.setAntMovementAxes(0.5, 0.7);
straight.setAntRunning(true);
straight.clearAntMovement();
near(straight.antVelocity.lengthSq(), 0);
near(straight.antMovementAxes.lengthSq(), 0);
assert.equal(straight.antMovementInput.size, 0);
assert.equal(straight.antRunEnabled, false);

const sliding = new NavigationHarness();
sliding.canAntOccupy = (x) => x <= 0;
sliding.setAntMovementKey('right', true);
sliding.setAntMovementKey('forward', true);
sliding.updateAntMovement(0.05);
near(sliding.ant.group.position.x, 0);
assert.ok(sliding.ant.group.position.z < 0, 'A wall should preserve travel along the free axis.');
near(sliding.antVelocity.x, 0);

const blocked = new NavigationHarness();
blocked.canAntOccupy = (x, z) => x === 0 && z === 0;
blocked.setAntMovementKey('forward', true);
blocked.updateAntMovement(0.05);
near(Math.hypot(blocked.ant.group.position.x, blocked.ant.group.position.z), 0);
assert.equal(blocked.animationPlaying, false);

const path = new NavigationHarness();
path.canAntOccupy = (x) => x < 0.2 || x > 0.3;
assert.equal(path.moveAntTo(0.5, 0), false, 'Swept travel must reject an obstacle between two valid endpoints.');
near(path.ant.group.position.x, 0);

const paused = new NavigationHarness();
paused.setAntMovementAxes(1, 1);
paused.activeView = 'hero';
paused.updateAntMovement(0.05);
near(paused.ant.group.position.lengthSq(), 0);

const camera = new NavigationHarness();
Object.assign(camera, {
  antCameraFollow: ANT_CAMERA_FOLLOW_CONFIG,
  antCameraTarget: new THREE.Vector3(),
  antCameraPosition: new THREE.Vector3(),
  antCameraAnchor: new THREE.Vector3(),
  antCameraLastPosition: new THREE.Vector3(),
  antCameraDelta: new THREE.Vector3(),
  viewOffset: new THREE.Vector3(),
});
camera.antCameraPose = { position: camera.antCameraPosition, target: camera.antCameraTarget };
const orbitOffset = camera.camera.position.clone().sub(camera.controls.target);
camera.ant.group.position.set(1, 0.4, -0.7);
camera.ant.group.rotation.y = 2.2;
camera.updateAntCamera(1 / 60);
near(camera.camera.position.clone().sub(camera.controls.target).distanceTo(orbitOffset), 0);
assert.ok(camera.controls.target.x > 0, 'Camera must follow movement without changing its orbit offset.');
for (let frame = 0; frame < 120; frame += 1) camera.updateAntCamera(1 / 60);
near(camera.controls.target.x, 1);
near(camera.controls.target.y, 0.4 + SCENE_PROPS.ant.cameraLookHeight);

const originalOffset = camera.camera.position.clone().sub(camera.controls.target);
function assistFor(seconds, travelX, travelZ, fps = 60) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame += 1) {
    camera.updateAntCameraAssistance(1 / fps, travelX / fps, travelZ / fps);
  }
}
assistFor(0.3, 1, 0);
near(camera.camera.position.clone().sub(camera.controls.target).distanceTo(originalOffset), 0);
assistFor(1, 1, 0);
assert.ok(camera.camera.position.x < camera.controls.target.x, 'Sustained rightward travel brings the camera behind travel.');
near(camera.camera.position.distanceTo(camera.controls.target), originalOffset.length());
near(camera.camera.position.y - camera.controls.target.y, originalOffset.y);
const assistedPosition = camera.camera.position.clone();
assistFor(1, 0, 0);
near(camera.camera.position.distanceTo(assistedPosition), 0);
camera.antCameraManualActive = true;
assistFor(1, -1, 0);
near(camera.camera.position.distanceTo(assistedPosition), 0);
camera.antCameraManualActive = false;
camera.antCameraAssistPause = ANT_CAMERA_FOLLOW_CONFIG.assistResumeDelay;
assistFor(2, -1, 0);
near(camera.camera.position.distanceTo(assistedPosition), 0);
assistFor(2, -1, 0);
assert.ok(camera.camera.position.distanceTo(assistedPosition) > 0.1, 'Assistance resumes after manual input cooldown.');
for (const fps of [30, 60, 120]) {
  camera.camera.position.copy(camera.controls.target).add(originalOffset);
  camera.antCameraAssistTravelTime = 1;
  camera.antCameraAssistPause = 0;
  assistFor(1, 0, 1, fps);
  const yaw = Math.atan2(camera.camera.position.x - camera.controls.target.x, camera.camera.position.z - camera.controls.target.z);
  near(Math.abs(yaw), ANT_CAMERA_FOLLOW_CONFIG.assistMaxSpeed, 1e-8);
}

const manualOrbit = new NavigationHarness();
Object.assign(manualOrbit, {
  antCameraFollow: ANT_CAMERA_FOLLOW_CONFIG,
  antCameraTarget: new THREE.Vector3(),
  antCameraPosition: new THREE.Vector3(),
  antCameraAnchor: new THREE.Vector3(),
  antCameraLastPosition: new THREE.Vector3(),
  antCameraDelta: new THREE.Vector3(),
  viewOffset: new THREE.Vector3(),
});
manualOrbit.antCameraPose = { position: manualOrbit.antCameraPosition, target: manualOrbit.antCameraTarget };
manualOrbit.setAntMovementKey('forward', true);
manualOrbit.updateAntMovement(1 / 60);
const heldDirection = manualOrbit.antMoveDirection.clone();
manualOrbit.controls.update = () => {
  const offset = manualOrbit.camera.position.clone().sub(manualOrbit.controls.target);
  const rotatedX = offset.z;
  offset.z = -offset.x;
  offset.x = rotatedX;
  manualOrbit.camera.position.copy(manualOrbit.controls.target).add(offset);
};
manualOrbit.updateAntOrbitControls(1 / 60);
manualOrbit.controls.update = () => {};
manualOrbit.updateAntMovement(1 / 60);
assert.ok(
  manualOrbit.antMoveDirection.dot(heldDirection) > 0.999999,
  'Manual camera orbit must not steer an unchanged held movement direction.',
);
manualOrbit.setAntMovementKey('forward', false);
manualOrbit.setAntMovementKey('right', true);
manualOrbit.updateAntMovement(1 / 60);
const manualCameraForward = manualOrbit.controls.target.clone()
  .sub(manualOrbit.camera.position)
  .setY(0)
  .normalize();
const manualCameraRight = new THREE.Vector3(-manualCameraForward.z, 0, manualCameraForward.x);
assert.ok(
  manualOrbit.antMoveDirection.dot(manualCameraRight) > 0.999999,
  'Changed movement input must adopt the manually rotated camera heading.',
);

const climbApp = { setAntAnimationPlaying() {} };
// Exercise movement and camera together to detect automatic steering loops.
for (const [x, y] of [[0, -1], [1, 0], [-1, 0], [0.7, -0.7]]) {
  for (const fps of [30, 60, 120]) {
    const coupled = new NavigationHarness();
    Object.assign(coupled, {
      antCameraFollow: ANT_CAMERA_FOLLOW_CONFIG,
      antCameraTarget: new THREE.Vector3(),
      antCameraPosition: new THREE.Vector3(),
      antCameraAnchor: new THREE.Vector3(),
      antCameraLastPosition: new THREE.Vector3(),
      antCameraDelta: new THREE.Vector3(),
      viewOffset: new THREE.Vector3(),
    });
    coupled.antCameraPose = { position: coupled.antCameraPosition, target: coupled.antCameraTarget };
    if (x) coupled.setAntMovementKey(x > 0 ? 'right' : 'left', true);
    if (y) coupled.setAntMovementKey(y > 0 ? 'forward' : 'backward', true);
    for (let frame = 0; frame < fps * 10; frame += 1) {
      coupled.updateAntMovement(1 / fps);
      coupled.updateAntCamera(1 / fps);
    }
    const direction = new THREE.Vector3(x, 0, -y).normalize();
    const position = coupled.ant.group.position;
    near(position.x * direction.z - position.z * direction.x, 0, 1e-7);
    assert.ok(position.dot(direction) > 0.1, 'Held movement must continue along its original travel direction.');
    const cameraForward = coupled.controls.target.clone().sub(coupled.camera.position).setY(0).normalize();
    assert.ok(cameraForward.dot(direction) > 0.999, 'Camera must settle behind travel rather than orbit endlessly.');
    coupled.clearAntMovement();
    coupled.setAntMovementKey('forward', true);
    coupled.updateAntMovement(1 / fps);
    assert.ok(coupled.antMoveDirection.dot(cameraForward) > 0.999, 'Fresh input uses the current camera heading.');
  }
}
const climb = new AntClimbing(climbApp);
// Joystick movement should use the same orbit compensation as keyboard movement.
for (const fps of [20, 60, 120]) {
  for (const yaw of [Math.PI / 2, -Math.PI + 0.01, Math.PI - 0.01]) {
    const joystick = new NavigationHarness();
    joystick.setAntMovementAxes(0, 1);
    joystick.updateAntMovement(1 / fps);
    const heldDirection = joystick.antMoveDirection.clone();
    const target = joystick.controls.target;
    const horizontalRadius = Math.hypot(
      joystick.camera.position.x - target.x,
      joystick.camera.position.z - target.z,
    );
    const cameraY = joystick.camera.position.y;
    joystick.controls.update = () => {
      joystick.camera.position.set(
        target.x + Math.sin(yaw) * horizontalRadius,
        cameraY,
        target.z + Math.cos(yaw) * horizontalRadius,
      );
    };
    joystick.updateAntOrbitControls(1 / fps);
    joystick.controls.update = () => {};
    joystick.updateAntMovement(1 / fps);
    assert.ok(
      joystick.antMoveDirection.dot(heldDirection) > 0.999999,
      `Camera orbit must not steer a held joystick direction: ${joystick.antMoveDirection.toArray()} vs ${heldDirection.toArray()}, yaw ${joystick.antCameraMovementYaw}.`,
    );
    joystick.setAntMovementAxes(1, 0);
    joystick.updateAntMovement(1 / fps);
    const cameraForward = target.clone().sub(joystick.camera.position).setY(0).normalize();
    const cameraRight = new THREE.Vector3(-cameraForward.z, 0, cameraForward.x);
    assert.ok(
      joystick.antMoveDirection.dot(cameraRight) > 0.999999,
      'A changed joystick direction should use the current camera heading.',
    );
    joystick.clearAntMovement();
    joystick.setAntMovementAxes(0, 1);
    joystick.updateAntMovement(1 / fps);
    assert.ok(
      joystick.antMoveDirection.dot(cameraForward) > 0.999999,
      'Fresh joystick input should use the current camera heading.',
    );
    joystick.antCameraFollow = ANT_CAMERA_FOLLOW_CONFIG;
    const orbit = joystick.camera.position.clone();
    for (let frame = 0; frame < fps * 4; frame += 1) {
      joystick.updateAntCameraAssistance(1 / fps, 0.1 / fps, 0);
    }
    assert.ok(
      joystick.camera.position.distanceTo(orbit) > 0.1,
      'Joystick movement should receive the same delayed camera assistance as keyboard movement.',
    );
  }
}
climb.setMovementAxes(0, 0.56);
climb.phase = 'surface';
climb.route = { label: 'Test surface' };
climb.surfacePoint.set(0, 0, 0);
climb.surfaceNormal.set(0, 1, 0);
climb.getSurfaceMoveDirection = () => new THREE.Vector3(0, 0, 1);
let probedDistance = 0;
climb.findAdjacentContact = (position, direction, distance) => {
  probedDistance = distance;
  return { position: position.clone(), normal: new THREE.Vector3(0, 1, 0) };
};
climb.applySurfacePose = () => true;
climb.appendDebugTrail = () => {};
climb.updateDebugContact = () => {};
climb.updateSurfaceMovement(0.05);
const halfSpeedDistance = probedDistance;
climb.setMovementAxes(0, 1);
climb.updateSurfaceMovement(0.05);
near(halfSpeedDistance * 2, probedDistance);
climb.setPaused(true);
near(climb.movementAxes.lengthSq(), 0);
climb.setMovementAxes(1, 1);
near(climb.movementAxes.lengthSq(), 0);

// Regressions for gaps, elevated tree geometry, angled edges, and climb exits.
const { createObjectGroundFootprint } = await importRuntime('../js/props/model-surface-proxy.js');
const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2, 16));
trunk.position.y = 0.9;
const trunkFootprint = createObjectGroundFootprint(trunk, {
  baseHeight: 0, maximumHeightAboveBase: SCENE_PROPS.ant.collisionHeight,
});
assert.equal(trunkFootprint.containsGroundPoint(0, 0, 0), true,
  'A capped trunk must be solid inside, including after a climb exit.');
assert.equal(trunkFootprint.containsGroundPoint(0.27, 0, SCENE_PROPS.ant.collisionRadius), false,
  'Grid cells must not widen the trunk beyond its exact edge plus ant radius.');
const taperGeometry = new THREE.BufferGeometry();
taperGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  0, 0, -0.1, 0, 0, 0.1, 2, 2, 0,
], 3));
const taper = createObjectGroundFootprint(new THREE.Mesh(taperGeometry), {
  baseHeight: 0, maximumHeightAboveBase: 0.1,
});
assert.equal(taper.containsGroundPoint(1, 0, 0.045), false,
  'The high part of a sloping triangle must not block a ground path.');
assert.equal(taper.containsGroundPoint(0.05, 0, 0), true);
const buried = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.2));
buried.position.y = -0.2;
assert.equal(createObjectGroundFootprint(buried, {
  baseHeight: 0, maximumHeightAboveBase: 0.1,
}), null, 'Fully buried roots must not block ground movement.');
const { createTree } = await importRuntime('../js/generators/tree.js');
for (const quality of ['low', 'medium', 'high']) {
  const tree = createTree({ seed: 'ancient-oak', quality });
  const footprint = createObjectGroundFootprint(tree.woodMesh, {
    baseHeight: 0, maximumHeightAboveBase: SCENE_PROPS.ant.collisionHeight,
  });
  assert.equal(footprint.containsGroundPoint(0, 0, 0), true,
    `The generated ${quality} trunk must have a solid ground cross section.`);
  tree.group.userData.dispose();
}
const passage = new THREE.Group();
for (const sign of [-1, 1]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1));
  wall.position.set(sign * 0.151, 0.05, 0);
  passage.add(wall);
}
const passageFootprint = createObjectGroundFootprint(passage, {
  baseHeight: 0, maximumHeightAboveBase: 0.1,
});
for (let z = -0.5; z <= 0.5; z += 0.01) {
  assert.equal(passageFootprint.containsGroundPoint(0, z, SCENE_PROPS.ant.collisionRadius), false,
    'A gap wider than the ant body must remain open along its length.');
}
assert.equal(passageFootprint.containsGroundPoint(0.02, 0, SCENE_PROPS.ant.collisionRadius), true,
  'The ant body must still collide with the side of the passage.');
const angled = new NavigationHarness();
angled.canAntOccupy = (x, z) => x >= 0 && z >= 0 && Math.abs(x - z) < 1e-8;
angled.setAntMovementKey('right', true);
angled.updateAntMovement(0.05);
assert.ok(angled.ant.group.position.x > 0 && angled.ant.group.position.z > 0,
  'Sliding must find a diagonal opening even when both world axes are blocked.');
const exit = Object.create(AntClimbing.prototype);
exit.route = { center: new THREE.Vector3(), entryRadius: 0.2, entry: new THREE.Vector3() };
exit.surfaceMove = new THREE.Vector3();
exit.surfacePoint = new THREE.Vector3(0, 0.7, 0);
exit.surfaceNormal = new THREE.Vector3(1, 0, 0);
exit.surfaceTangent = new THREE.Vector3(0, 0, 1);
exit.app = {
  canAntOccupy: () => false,
  getAntGroundPosition: (x, z, target) => target.set(x, 0, z),
};
assert.equal(exit.findDismountPosition(), null, 'A blocked saved entry must never be a landing fallback.');
assert.equal(exit.finishRoute(new THREE.Vector3()), false, 'An invalid landing must not unlock ground motion.');
exit.app.canAntOccupy = (x, z) => Math.hypot(x, z) >= 0.3;
const safeLanding = exit.findDismountPosition();
assert.ok(safeLanding && exit.app.canAntOccupy(safeLanding.x, safeLanding.z),
  'Dismount must search past the trunk to a valid ground position.');

exit.route = {
  id: 'reader', center: new THREE.Vector3(), entryRadius: 0.5,
  entry: new THREE.Vector3(),
  bounds: { min: new THREE.Vector3(-0.6, 0, -0.6), max: new THREE.Vector3(0.6, 1, 0.6) },
};
exit.app.canAntOccupy = () => true;
const readerLanding = exit.findDismountPosition();
assert.ok(readerLanding && (Math.abs(readerLanding.x) > 0.6 || Math.abs(readerLanding.z) > 0.6),
  'Dismounting the reader must avoid walkable gaps underneath the person.');
exit.app.canAntOccupy = (x, z) => Math.abs(x) <= 0.6 && Math.abs(z) <= 0.6;
assert.equal(exit.findDismountPosition(), null,
  'An entry under the reader must not be used when outside landings are blocked.');

console.log('Player motion checks passed: analog deadzone, frame-rate invariance, acceleration/braking, direction, collision/sliding, input reset, stable automatic and manual camera orbit, analog climbing, exact ground footprints, solid tree interiors, diagonal gaps, and safe climb exits.');
