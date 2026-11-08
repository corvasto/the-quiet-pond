import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { bindPressAction } from '../js/ui/press-action.js';
import { shouldTouchRun } from '../js/utils/player-motion.js';
import { ANT_MOVEMENT_CONFIG } from '../js/config/world.js';

const handlers = () => {
  const events = new Map();
  return { events, addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name), classList: { add() {}, remove() {}, toggle() {} } };
};
const joystick = handlers(), climb = handlers();
let capture = null, axes = [0, 0], climbing = false, enter = false;
Object.assign(joystick, { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  setPointerCapture: (id) => { capture = id; }, hasPointerCapture: (id) => capture === id,
  releasePointerCapture: () => { capture = null; } });
const session = { setMovementAxes: (x, y) => { axes = [x, y]; }, isClimbing: () => climbing,
  isBirdActive: () => false, isFlightEnabled: () => false, unlockSound() {},
  toggleClimb() { if (enter) { climbing = !climbing; axes = [0, 0]; } } };
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const source = main.slice(main.indexOf('function setupMobileGameControls()'), main.indexOf("window.addEventListener('keydown'"));
const context = vm.createContext({ elements: { movementJoystick: joystick, movementKnob: { style: {} }, climbButton: climb },
  session, mobileMovementCleanup: null, resetMobileControls: null, touchRunHeld: false,
  canMoveAnt: () => true, syncRunning() {}, syncMovementDirection() {}, bindPressAction, shouldTouchRun,
  POND_GAME: { antMovement: ANT_MOVEMENT_CONFIG } });
vm.runInContext(`${source}\nsetupMobileGameControls()`, context);
joystick.events.get('pointerdown')({ pointerId: 1, button: 0, clientX: 50, clientY: 20, preventDefault() {} });
const walking = [...axes]; assert.ok(walking[1] > 0);
const press = { pointerId: 2, isPrimary: false, button: 0, preventDefault() {} };
climb.events.get('pointerdown')(press);
assert.deepEqual(axes, walking, 'A failed climb press cannot stop joystick movement');
assert.equal(capture, 1);
enter = true; climb.events.get('pointerdown')(press);
assert.ok(climbing); assert.deepEqual(axes, walking, 'Entering a climb restores held axes after the controller clears input');
assert.equal(capture, 1);
climb.events.get('pointerdown')(press);
assert.equal(climbing, false); assert.deepEqual(axes, walking, 'Dismount preserves the held direction');
context.mobileMovementCleanup(); assert.deepEqual(axes, [0, 0]); assert.equal(capture, null);
console.log('Mobile climb input checks passed: failed attempts, climb transfer, dismount, joystick capture, and cleanup.');
