import assert from 'node:assert/strict';
import * as THREE from 'three';

// This process opts into debug before configuration modules are evaluated.
globalThis.location = { search: '?debug=1' };
const { PondGameSession } = await import('../js/game/game-session.js');
let lightingHour;
let displayedHour;
let objectiveHour;
let radioHour;
let ambienceHour;
const session = new PondGameSession(null, { onTimeChange: (hour) => { displayedHour = hour; } });
session.app = {
  setSunHour: (hour) => { lightingHour = hour; },
  getAntWorldPosition: (target) => target.set(0, 0.17, 0),
  getAntFacingDirection: (target) => target.set(0, 0, 1),
};
session.worldTimeHours = 10.5;
session.debugWeatherOverride = true;
session.game = { getSaveState: () => ({}) };
session.objectives = {
  setWorldState: ({ hour }) => { objectiveHour = hour; },
  getSaveState: () => ({}),
};
session.radioAudio = { update: ({ hour }) => { radioHour = hour; } };
session.ambienceAudio = { update: (_delta, hour) => { ambienceHour = hour; } };

assert.equal(session.setDebugTime(22.25), true);
assert.equal(lightingHour, 22.25);
assert.equal(displayedHour, 22.25);
assert.equal(objectiveHour, 22.25);
assert.equal(session.getSaveState().worldTimeHours, 10.5, 'Preview time does not overwrite the saved clock.');
session.updateWorldCycle({ delta: 0.25 });
assert.equal(session.getCurrentWorldHour(), 22.25, 'Frozen preview time stays fixed.');
assert.ok(session.worldTimeHours > 10.5, 'The normal clock continues behind the preview.');
assert.equal(radioHour, 22.25);
assert.equal(ambienceHour, 22.25);
session.setDebugTimeFrozen(false);
session.updateWorldCycle({ delta: 0.25 });
assert.ok(session.getCurrentWorldHour() > 22.25, 'An unfrozen preview advances normally.');
session.paused = true;
session.setDebugTime(0);
assert.equal(lightingHour, 0, 'Midnight applies even while the game is paused.');
session.setDebugTime(-1);
assert.equal(session.getCurrentWorldHour(), 23, 'Hours wrap safely across midnight.');
assert.equal(session.setDebugTime(NaN), false);
assert.equal(session.setDebugTime(Infinity), false);
assert.equal(session.getCurrentWorldHour(), 23);
session.clearDebugTime();
assert.equal(lightingHour, session.worldTimeHours);
assert.equal(displayedHour, session.worldTimeHours);
assert.equal(objectiveHour, session.worldTimeHours);
assert.equal(session.getCurrentWorldHour(), session.getSaveState().worldTimeHours);
assert.equal(session.setDebugTimeFrozen(true), false, 'There is no override to freeze after resetting.');
assert.ok(session.getSavePosition() instanceof THREE.Vector3);
console.log('Debug time checks passed: exact hours, midnight wrapping, frozen/running preview, lighting/objective/audio consistency, paused edits, invalid input, reset, and saved clock isolation.');
