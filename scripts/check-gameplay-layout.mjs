import assert from 'node:assert/strict';
import { resolveCaptionLayout, createGameplayLayout } from '../js/ui/gameplay-layout.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const cases = [
  { width: 360, height: 640, headers: [rect(12,12,72,44),rect(98,12,250,44),rect(48,68,300,44)],
    obstacles: [rect(40,400,280,44),rect(18,452,120,120),rect(270,480,72,72),rect(20,604,320,24)] },
  { width: 780, height: 360, headers: [rect(12,12,72,44),rect(400,12,368,44),rect(468,68,300,44)],
    obstacles: [rect(250,268,280,44),rect(18,170,140,140),rect(610,220,88,88),rect(220,328,340,24)] },
  { width: 640, height: 360, headers: [rect(12,12,72,44),rect(280,12,348,44),rect(328,68,300,44)],
    obstacles: [rect(210,260,220,52),rect(18,170,140,140),rect(520,220,88,88),rect(160,328,320,24)] },
  { width: 1440, height: 900, headers: [rect(30,28,360,44),rect(30,94,120,44),rect(750,22,660,48),rect(1060,90,350,60)],
    obstacles: [rect(500,650,440,54),rect(320,840,800,40)] },
];
for (const example of cases) for (const height of [34, 72, 120]) {
  const result = resolveCaptionLayout({ ...example, captionHeight: height });
  const box = rect(result.left, result.top, result.width, result.maxHeight);
  assert.ok(box.left >= 0 && box.right <= example.width && box.top >= 0 && box.bottom <= example.height);
  for (const obstacle of [...example.headers, ...example.obstacles]) assert.equal(intersects(box, obstacle), false,
    'Radio text cannot occupy the same rectangle as a header, action, joystick, or hint.');
  assert.ok(!(box.left <= example.width / 2 && box.right >= example.width / 2
    && box.top <= example.height / 2 && box.bottom >= example.height / 2), 'The center player view remains uncovered.');
}
const wrappedDock = { ...cases[1], obstacles: [rect(250,208,280,104), ...cases[1].obstacles.slice(1)] };
const wrapped = resolveCaptionLayout({ ...wrappedDock, captionHeight: 72 });
assert.equal(intersects(rect(wrapped.left,wrapped.top,wrapped.width,wrapped.maxHeight),wrappedDock.obstacles[0]),false,
  'A two-row action dock reserves its measured height.');

// Exercise lifecycle and RAF coalescing without starting a browser or server.
let queued = null, disconnected = 0, cancelled = 0;
const events = new Map();
class Observer {
  constructor(callback) { this.callback = callback; }
  observe() {}
  disconnect() { disconnected++; }
}
const properties = new Map(), attributes = new Map();
const fakeWindow = { innerWidth: 780, innerHeight: 360,
  ResizeObserver: Observer, MutationObserver: Observer,
  requestAnimationFrame(callback) { queued = callback; return 1; },
  cancelAnimationFrame() { cancelled++; queued = null; },
  addEventListener(name, handler) { events.set(name,handler); }, removeEventListener(name) { events.delete(name); } };
const caption = { hidden: false, style: { getPropertyValue: (name) => properties.get(name),
  setProperty: (name,value) => properties.set(name,value), removeProperty: (name) => properties.delete(name) },
  setAttribute: (name,value) => attributes.set(name,value),removeAttribute: (name) => attributes.delete(name),
  getClientRects: () => [rect(0,0,300,72)],getBoundingClientRect: () => rect(0,0,300,72) };
const header = { hidden: false,getClientRects:()=>[cases[1].headers[0]],getBoundingClientRect:()=>cases[1].headers[0] };
const dock = { hidden: false,getClientRects:()=>[cases[1].obstacles[0]],getBoundingClientRect:()=>cases[1].obstacles[0] };
const document = { defaultView: fakeWindow,documentElement:{clientWidth:780},body:{},
  querySelectorAll: (selector) => selector.includes('.game-brand') ? [header] : [] };
caption.ownerDocument = document;
const layout = createGameplayLayout({caption,dock});
assert.ok(queued); queued();
assert.ok(attributes.has('data-hud-managed'));
assert.ok(properties.has('--hud-caption-top'));
events.get('resize')(); events.get('resize')();
layout.dispose();
assert.equal(disconnected,2); assert.equal(events.size,0); assert.equal(cancelled,1);
assert.equal(properties.size,0);assert.equal(attributes.size,0);
console.log('Gameplay HUD layout checks passed: responsive caption/action separation, wrapped docks, center clearance, and observer cleanup.');
