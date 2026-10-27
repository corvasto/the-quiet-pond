import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.module.js';
import { POND_GAME } from '../js/config/game.js';
import { GAME_OBJECTIVES, MANAGED_GAME_OBJECTIVES } from '../js/content/objectives.js';

// Exercise the controller with real vectors and inert speech instead of browser DOM.
const source = fs.readFileSync(new URL('../js/game/game-objectives.js', import.meta.url), 'utf8')
  .replace(/import[\s\S]*?;\s*/g, '')
  .replace('export class PondGameObjectives', 'class PondGameObjectives');
const Controller = vm.runInNewContext(`${source}\nPondGameObjectives;`, {
  THREE, POND_GAME, GAME_OBJECTIVES, MANAGED_GAME_OBJECTIVES,
  WorldSpeech: class { update() {} },
});
const ant = new THREE.Vector3();
const roach = new THREE.Vector3(2, 0, 0);
const companionAnt = { group: { parent: {}, position: new THREE.Vector3(3, 0, 0) } };
let present = true;
const app = {
  getAntWorldPosition: (target) => target.copy(ant),
  getCockroachWorldPosition: (target) => present ? target.copy(roach) : null,
  backgroundAnts: [companionAnt],
};
const objectives = new Controller(app);
objectives.landmarkPositions.shelter = [];
const tick = (count) => { for (let i = 0; i < count; i++) objectives.update({ delta: 0.2 }); };
tick(10);
assert.equal(objectives.taskState.cockroach.complete, false);
roach.set(0.4, 0, 0);
tick(3);
roach.set(2, 0, 0);
tick(1);
assert.equal(objectives.taskState.cockroach.elapsed, 0, 'Leaving the moving target resets progress.');
roach.set(0.4, 0, 0);
present = false;
tick(10);
assert.equal(objectives.taskState.cockroach.complete, false, 'A missing model cannot complete the objective.');
present = true;
objectives.setPaused(true);
tick(10);
assert.equal(objectives.taskState.cockroach.elapsed, 0);
objectives.setPaused(false);
tick(6);
assert.equal(objectives.taskState.cockroach.complete, true);
assert.equal(objectives.getSnapshot().total, 12);
companionAnt.group.position.set(0.3, 0, 0);
tick(6);
assert.equal(objectives.taskState.companionAnt.complete, true, 'Meeting a visible companion ant completes its objective.');
companionAnt.group.parent = null;
const absentCompanion = new Controller(app);
absentCompanion.landmarkPositions.shelter = [];
absentCompanion.taskState.companionAnt.elapsed = 0.8;
absentCompanion.update({ delta: 0.2 });
assert.equal(absentCompanion.taskState.companionAnt.elapsed, 0, 'A hidden companion cannot progress the meeting objective.');
const restored = new Controller(app);
restored.restoreSaveState(objectives.getSaveState());
assert.equal(restored.taskState.cockroach.complete, true);
restored.restoreSaveState({ completedTaskIds: ['frog', 'cat'] });
assert.equal(restored.taskState.frog.complete, true);
assert.equal(restored.taskState.cockroach.complete, false, 'Old saves gain an incomplete meeting objective.');
const signatures = new Set();
for (let mask = 0; mask < 2 ** MANAGED_GAME_OBJECTIVES.length; mask++) {
  MANAGED_GAME_OBJECTIVES.forEach(({ id }, index) => { restored.taskState[id].complete = Boolean(mask & (1 << index)); });
  const signature = restored.getSnapshotSignature();
  assert.ok(!signatures.has(signature), 'Different checklist completions must have distinct cache signatures.');
  signatures.add(signature);
}
restored.raining = false;
const drySignature = restored.getSnapshotSignature();
restored.raining = true;
assert.equal(restored.getSnapshotSignature(), drySignature, 'Weather alone does not change checklist contents.');
console.log('Objective checks passed: moving target, companion ant meeting, absence, pause, linger reset, completion, save compatibility, and cache signatures.');
