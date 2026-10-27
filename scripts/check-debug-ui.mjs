import assert from 'node:assert/strict';
import { createDebugControls } from '../js/ui/debug-controls.js';
import { translate } from '../js/ui/localization.js';

class ElementStub {
  constructor() {
    this.hidden = true;
    this.value = '';
    this.checked = true;
    this.disabled = false;
    this.valid = true;
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
    this.textWrites = 0;
  }
  set textContent(value) { this.text = value; this.textWrites += 1; }
  get textContent() { return this.text ?? ''; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(child) { this.children.push(child); }
  reportValidity() { return this.valid; }
  setPointerCapture(id) { this.capturedPointer = id; }
  hasPointerCapture(id) { return this.capturedPointer === id; }
  releasePointerCapture() { this.capturedPointer = null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, values = {}) {
    const event = {
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
      stopImmediatePropagation() { this.immediateStopped = true; },
      ...values,
    };
    if (type === 'click' && this.disabled) return event;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
      if (event.immediateStopped) break;
    }
    return event;
  }
}

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const nodes = new Map();
const byId = (id) => {
  if (!nodes.has(id)) nodes.set(id, new ElementStub());
  return nodes.get(id);
};
const body = new ElementStub();
const timers = new Map();
let nextTimerId = 0;
globalThis.document = { getElementById: byId, createElement: () => new ElementStub(), body };
globalThis.window = Object.assign(new ElementStub(), {
  setInterval(callback, delay) { timers.set(++nextTimerId, { callback, delay }); return nextTimerId; },
  clearInterval(id) { timers.delete(id); },
});

let session = null;
let hour = 10.5;
let language = 'en';
let enabled = false;
let available = false;
let explore = false;
let bird = false;
let flight = false;
let samples = 0;
let refreshes = 0;
const calls = [];
const prompts = [];
const captions = [];
const position = { x: 1.23456, y: -0.5, z: 7 };
const camera = {
  position: { x: 0, y: 3, z: 5 },
  target: { x: 1, y: 0, z: -1 },
  rotation: { x: Math.PI / 2, y: -Math.PI, z: 0 },
};
const t = (key, parameters) => translate(key, language, parameters);
const ui = createDebugControls({
  getSession: () => session,
  getGameHour: () => hour,
  translate: t,
  onToggle: () => { refreshes += 1; ui.sync({ ready: true }); },
  updatePrompt: (prompt) => prompts.push(prompt),
  showRadioCaption: (...args) => captions.push(args),
});
const key = (code, repeat = false) => {
  const event = { code, repeat, preventDefault() { this.defaultPrevented = true; } };
  event.handled = ui.handleKeyDown(event);
  return event;
};
const tick = () => { for (const timer of timers.values()) timer.callback(); };

try {
  ui.sync({ ready: false });
  assert.equal(timers.size, 0, 'Startup must not poll without a ready debug session.');
  session = {
    isClimbDebugAvailable: () => available,
    isClimbDebugEnabled: () => enabled,
    toggleClimbDebug: () => { enabled = !enabled; },
    isBirdActive: () => bird,
    canDebugRelocateAnt: () => enabled && explore && !bird,
    canDebugControlRadio: () => enabled,
    canDebugControlWeather: () => available,
    getPlayerWorldPosition: () => { samples += 1; return position; },
    getCameraDebugValues: () => camera,
    setDebugTime: (...args) => calls.push(['time', ...args]),
    setDebugTimeFrozen: (...args) => calls.push(['freeze', ...args]),
    clearDebugTime: () => { calls.push(['reset']); hour = 11.25; },
    debugCompleteObjective: (id) => calls.push(['objective', id]),
    toggleFlight: () => { flight = !flight; return flight; },
    cycleDebugRadioMusic: () => { calls.push(['music']); return 'night'; },
    playDebugRadioAnnouncement: () => { calls.push(['voice']); return true; },
    toggleDebugRain: () => { calls.push(['weather']); return 'rain'; },
    debugRelocateAnt: (x, y) => calls.push(['relocate', x, y]),
  };
  ui.sync({ ready: true });
  for (const id of ['debug-coordinates', 'debug-key-hint', 'debug-relocate-hint', 'radio-debug-hint']) {
    assert.equal(byId(id).hidden, true, `${id} stays hidden in normal gameplay.`);
  }
  const normalItem = new ElementStub();
  ui.appendChecklistControl(normalItem, { id: 'frog' });
  assert.equal(normalItem.children.length, 0);
  for (const code of ['KeyG', 'KeyY', 'KeyR', 'KeyV', 'KeyT']) key(code);
  assert.equal(enabled, false);
  assert.equal(calls.length, 0, 'Normal play must not run debug actions.');
  assert.equal(prompts.length, 0);
  assert.equal(timers.size, 0);
  assert.equal(samples, 0, 'Normal play must not sample debug coordinates.');

  available = true;
  enabled = true;
  ui.sync({ ready: false });
  assert.equal(timers.size, 0, 'Even enabled debug waits for startup to finish.');
  ui.sync({ ready: true });
  ui.sync({ ready: true });
  assert.equal(timers.size, 1, 'Repeated UI refreshes must not duplicate polling.');
  assert.equal([...timers.values()][0].delay, 100);
  assert.equal(byId('debug-coordinates').hidden, false);
  assert.equal(byId('debug-key-hint').hidden, false);
  assert.equal(byId('radio-debug-hint').hidden, false);
  assert.equal(byId('debug-coordinate-values').textContent, 'x 1.235  y -0.500  z 7.000');
  assert.equal(byId('debug-camera-position').textContent, 'x 0.000  y 3.000  z 5.000');
  assert.equal(byId('debug-camera-target').textContent, 'x 1.000  y 0.000  z -1.000');
  assert.equal(byId('debug-camera-rotation').textContent, 'x 90.000  y -180.000  z 0.000');
  const writes = byId('debug-coordinate-values').textWrites;
  tick();
  assert.equal(byId('debug-coordinate-values').textWrites, writes, 'Unchanged values must not rewrite the DOM.');
  position.x = 2;
  bird = true;
  language = 'id';
  tick();
  assert.match(byId('debug-coordinate-values').textContent, /^x 2\.000/);
  assert.equal(byId('debug-position-label').textContent, t('debug.bird.position'));
  bird = false;
  tick();
  assert.equal(byId('debug-position-label').textContent, t('debug.coordinates.title'));

  assert.equal(byId('debug-time-input').value, '10:30');
  byId('debug-time-input').value = '23:45';
  byId('debug-time-input').valid = false;
  byId('debug-time-apply').emit('click');
  assert.equal(calls.length, 0, 'Invalid time input must not reach the session.');
  byId('debug-time-input').valid = true;
  byId('debug-time-apply').emit('click');
  assert.deepEqual(calls.at(-1), ['time', 23.75, { freeze: true }]);
  byId('debug-time-freeze').checked = false;
  byId('debug-time-freeze').emit('change');
  assert.deepEqual(calls.at(-1), ['freeze', false]);
  ui.sync({ ready: true });
  assert.equal(byId('debug-time-input').value, '23:45', 'UI refreshes preserve time being edited.');
  byId('debug-time-reset').emit('click');
  assert.deepEqual(calls.at(-1), ['reset']);
  assert.equal(byId('debug-time-input').value, '11:15', 'Reset uses the clock updated by the session callback.');
  const task = { id: 'frog', label: 'objective.frog', complete: false };
  const item = new ElementStub();
  ui.appendChecklistControl(item, task);
  const control = item.children[0];
  assert.equal(item.classList.contains('has-debug-control'), true);
  assert.equal(control.attributes['aria-label'], t('debug.completeObjective', { task: t(task.label) }));
  assert.equal(control.emit('click').propagationStopped, true);
  assert.deepEqual(calls.at(-1), ['objective', 'frog']);
  const seeds = new ElementStub();
  ui.appendChecklistControl(seeds, { id: 'seeds', label: 'Seeds 0 / 10', complete: false });
  seeds.children[0].emit('click');
  assert.deepEqual(calls.at(-1), ['objective', 'seeds'], 'The seed checklist shortcut still reaches the gameplay action.');
  const completed = new ElementStub();
  ui.appendChecklistControl(completed, { ...task, complete: true });
  assert.equal(completed.children[0].disabled, true);
  assert.equal(completed.children[0].textContent, '✓');

  key('KeyY');
  key('KeyY');
  assert.deepEqual(prompts, ['debug.flight.enabled', 'debug.flight.disabled']);
  for (const code of ['KeyR', 'KeyV', 'KeyT']) assert.equal(key(code).defaultPrevented, true);
  assert.deepEqual(calls.slice(-3), [['music'], ['voice'], ['weather']]);
  assert.deepEqual(captions, [
    [t('debug.radio.music', { mode: 'night' }), 3],
    [t('debug.radio.voice', { result: true }), 3],
    [t('debug.weather', { phase: 'rain' }), 3],
  ]);
  const callCount = calls.length;
  const refreshCount = refreshes;
  for (const code of ['KeyG', 'KeyY', 'KeyR', 'KeyV', 'KeyT']) key(code, true);
  assert.equal(calls.length, callCount);
  assert.equal(refreshes, refreshCount);
  assert.equal(key('KeyW').handled, false, 'Normal movement remains with main.');
  assert.equal(key('KeyB').handled, false, 'Bird switching remains with main and the session.');

  const canvas = new ElementStub();
  ui.start(canvas);
  ui.start(canvas);
  explore = true;
  ui.sync({ ready: true });
  assert.equal(byId('debug-relocate-hint').hidden, false);
  assert.equal(body.classList.contains('debug-ant-relocate'), true);
  canvas.emit('pointerdown', { button: 0, shiftKey: false, pointerId: 1 });
  assert.equal(calls.length, callCount);
  const pointer = { button: 0, shiftKey: true, pointerId: 1, clientX: 10, clientY: 20 };
  assert.equal(canvas.emit('pointerdown', pointer).immediateStopped, true);
  assert.equal(calls.length, callCount + 1, 'Reattaching must remove old pointer listeners.');
  assert.deepEqual(calls.at(-1), ['relocate', 10, 20], 'Shift-click relocates immediately.');
  canvas.emit('pointermove', { ...pointer, clientX: 30 });
  assert.deepEqual(calls.at(-1), ['relocate', 30, 20]);
  const movedCount = calls.length;
  canvas.emit('pointermove', { ...pointer, pointerId: 2 });
  assert.equal(calls.length, movedCount, 'Other pointers must not move the ant.');
  canvas.emit('pointerup', pointer);
  assert.equal(canvas.capturedPointer, null);
  assert.equal(body.classList.contains('debug-ant-dragging'), false);
  bird = true;
  ui.sync({ ready: true });
  canvas.emit('pointerdown', pointer);
  assert.equal(calls.length, movedCount, 'Explore relocation must not affect bird control.');
  bird = false;

  key('KeyG');
  assert.equal(enabled, false);
  assert.equal(timers.size, 0, 'Hiding debug removes polling.');
  assert.equal(byId('debug-coordinates').hidden, true);
  assert.equal(key('KeyR').handled, false);
  assert.equal(key('KeyT').handled, true, 'Weather testing remains available when G hides the overlay.');
  key('KeyG');
  assert.equal(timers.size, 1);
  canvas.emit('pointerdown', pointer);
  ui.dispose();
  ui.dispose();
  assert.equal(timers.size, 0);
  assert.equal(canvas.capturedPointer, null);
  assert.equal(body.classList.contains('debug-ant-dragging'), false);
  assert.equal(body.classList.contains('debug-ant-relocate'), false);
  const disposedCalls = calls.length;
  byId('debug-time-apply').emit('click');
  byId('debug-time-reset').emit('click');
  byId('debug-time-freeze').emit('change');
  canvas.emit('pointerdown', pointer);
  assert.equal(calls.length, disposedCalls, 'Disposal removes control and pointer listeners.');
  assert.equal(globalThis.window.listeners.get('blur').size, 0);
} finally {
  ui.dispose();
  globalThis.document = previousDocument;
  globalThis.window = previousWindow;
}

console.log('Debug UI checks passed: normal-mode isolation, bounded polling, coordinates, localization, time controls, checklist shortcuts, keyboard routing, radio/weather, Explore relocation, and cleanup.');
