import assert from 'node:assert/strict';
import { FpsSampler } from '../js/utils/fps-diagnostic.js';

function sampleAt(fps, sampler) {
  const delta = 1 / fps;
  let result = null;
  while (!result) result = sampler.update(delta);
  return result;
}

const sampler = new FpsSampler({ sampleSeconds: 0.75, warningFps: 14, recoveryMargin: 2 });

assert.equal(sampler.update(1 / 20), null, 'The diagnostic must wait for a useful sample window.');
sampler.reset();

const healthy = sampleAt(18, sampler);
assert.ok(Math.abs(healthy.fps - 18) <= 1, 'The diagnostic must report rendered frame rate.');
assert.equal(healthy.low, false, 'Eighteen FPS must be healthy for capped profiles.');

const slow = sampleAt(10, sampler);
assert.ok(Math.abs(slow.fps - 10) <= 1, 'The diagnostic must detect a low frame rate.');
assert.equal(slow.low, true, 'Ten FPS must trigger the warning.');

const nearRecovery = sampleAt(15, sampler);
assert.equal(nearRecovery.low, true, 'Warning hysteresis must avoid threshold flicker.');
const recovered = sampleAt(18, sampler);
assert.equal(recovered.low, false, 'The warning must clear after a healthy recovery.');

assert.equal(sampler.update(1), null, 'A suspended or hidden-tab gap must reset sampling.');

console.log('FPS diagnostic checks passed: sampling, profile threshold, warning hysteresis, recovery, and suspended-frame reset.');
