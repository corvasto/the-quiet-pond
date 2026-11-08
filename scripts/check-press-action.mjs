import assert from 'node:assert/strict';
import { bindPressAction, bindHoldAction } from '../js/ui/press-action.js';

const handlers = new Map();
const button = { disabled: false,
  addEventListener: (type, handler) => handlers.set(type, handler),
  removeEventListener: (type) => handlers.delete(type),
  setPointerCapture: () => { throw new Error('An instant action must not steal joystick capture'); },
};
let activated = 0, prevented = 0;
const cleanup = bindPressAction(button, () => activated++);
const press = { pointerId: 22, isPrimary: false, pointerType: 'touch', button: 0,
  preventDefault: () => prevented++ };
handlers.get('pointerdown')(press);
assert.equal(activated, 1, 'A secondary touch activates without waiting for joystick release');
assert.equal(prevented, 1, 'Touch activation suppresses focus and compatibility mouse behavior');
handlers.get('click')({ detail: 1 });
assert.equal(activated, 1, 'The generated pointer click cannot trigger the action twice');
handlers.get('click')({ detail: 0 });
assert.equal(activated, 2, 'Keyboard and assistive clicks still activate');
button.disabled = true;
handlers.get('pointerdown')(press); handlers.get('click')({ detail: 0 });
assert.equal(activated, 2, 'Cooldown buttons cannot activate');
button.disabled = false;
handlers.get('pointerdown')({ ...press, button: 2 });
assert.equal(activated, 2, 'Secondary mouse buttons are ignored');
cleanup(); assert.equal(handlers.size, 0);
bindPressAction(null, () => { throw new Error('Missing control activated'); })();
let held = false;
button.setPointerCapture = () => {};
const releaseHold = bindHoldAction(button, (value) => { held = value; });
handlers.get('pointerdown')(press); assert.equal(held, true);
handlers.get('pointerup')({pointerId: 999}); assert.equal(held, true, 'Another finger cannot release this hold');
handlers.get('pointerup')({pointerId: 22}); assert.equal(held, false, 'Release stops boost immediately');
handlers.get('pointerdown')(press); handlers.get('pointercancel')({pointerId: 22}); assert.equal(held, false);
handlers.get('keydown')({code:'Space',preventDefault(){}}); assert.equal(held,true);
handlers.get('keyup')({code:'Space',preventDefault(){}}); assert.equal(held,false);
handlers.get('pointerdown')(press); handlers.get('lostpointercapture')({pointerId:22}); assert.equal(held,false);
handlers.get('pointerdown')(press); releaseHold(); assert.equal(held,false); assert.equal(handlers.size,0);
console.log('Press action checks passed: secondary touch, immediate activation, no capture theft, click deduplication, keyboard, disabled state, and cleanup.');
