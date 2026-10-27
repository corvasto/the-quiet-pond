import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GAME_OBJECTIVES } from '../js/content/objectives.js';
import { MESSAGE_CATALOG } from '../js/content/messages.js';
import { ObjectiveChime } from '../js/game/objective-chime.js';

const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
for (const { id } of GAME_OBJECTIVES) {
  for (const language of ['en', 'id']) {
    for (const field of ['title', 'description']) {
      assert.ok(MESSAGE_CATALOG[language][`cards.${id}.${field}`], `${id} needs a ${language} ${field}.`);
    }
  }
  const imagePath = `./assets/images/discovery-cards/${id}.png`;
  const image = fs.readFileSync(new URL(`../${imagePath.slice(2)}`, import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${id} must be a PNG.`);
  assert.ok(worker.includes(`'${imagePath}'`), `${id} must be cached offline.`);
}
let starts = 0;
const parameter = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
const chime = new ObjectiveChime();
chime.context = {
  state: 'running', currentTime: 0, destination: {},
  createOscillator: () => ({ frequency: parameter, connect: (node) => node, start: () => { starts += 1; }, stop() {} }),
  createGain: () => ({ gain: parameter, connect: () => {} }),
};
chime.playCardReveal();
assert.equal(starts, 3, 'Opening a card plays the three soft tones.');
chime.setEnabled(false);
chime.playCardReveal();
assert.equal(starts, 3, 'Muted chimes do not play the card sound.');
chime.setEnabled(true);
chime.context.state = 'suspended';
chime.playCardReveal();
assert.equal(starts, 3, 'A suspended audio context does not play the card sound.');
console.log('Discovery card checks passed: objective coverage, translations, PNG assets, and offline caching.');
