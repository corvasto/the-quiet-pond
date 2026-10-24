import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.module.js';
import { SCENE_PROPS } from '../js/config/index.js';
import { ANT_CAMERA_FOLLOW_CONFIG, ANT_MOVEMENT_CONFIG } from '../js/config/world.js';
import {
  clampMotionDelta,
  clampMovementAxis,
  resolveMovementAxes,
  stepPlanarMotion,
} from '../js/utils/player-motion.js';

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
// Drag handlers can update the camera between animation frames.
for (const fps of [20, 60, 120]) {
  const joystick = new NavigationHarness();
  joystick.setAntMovementAxes(0, 1);
  joystick.updateAntMovement(1 / fps);
  for (const yaw of [Math.PI / 2, -Math.PI + 0.01, Math.PI - 0.01]) {
    joystick.camera.position.set(Math.sin(yaw), 0.6, Math.cos(yaw));
    joystick.updateAntMovement(1 / fps);
    near(joystick.antMoveDirection.x, -Math.sin(yaw));
    near(joystick.antMoveDirection.z, -Math.cos(yaw));
    joystick.setAntMovementAxes(1, 0);
    joystick.updateAntMovement(1 / fps);
    near(joystick.antMoveDirection.x, Math.cos(yaw));
    near(joystick.antMoveDirection.z, -Math.sin(yaw));
    joystick.clearAntMovement();
    joystick.setAntMovementAxes(0, 1);
    joystick.updateAntMovement(1 / fps);
    near(joystick.antMoveDirection.x, -Math.sin(yaw));
    near(joystick.antMoveDirection.z, -Math.cos(yaw));
    joystick.antCameraFollow = ANT_CAMERA_FOLLOW_CONFIG;
    const orbit = joystick.camera.position.clone();
    for (let frame = 0; frame < fps * 4; frame += 1) {
      joystick.updateAntCameraAssistance(1 / fps, 0.1 / fps, 0);
    }
    near(joystick.camera.position.distanceTo(orbit), 0);
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

console.log('Player motion checks passed: analog deadzone, frame-rate invariance, acceleration/braking, direction, collision/sliding, input reset, stable automatic and manual camera orbit, and analog climbing.');
