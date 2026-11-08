import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PondGameSession } from '../js/game/game-session.js';
import { ANT_MOVEMENT_CONFIG } from '../js/config/world.js';

assert.equal(ANT_MOVEMENT_CONFIG.desktopDefaultRunning, true);
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const source = main.slice(main.indexOf('function syncRunning()'), main.indexOf('\nfunction syncMovementDirection('));
for (const automatic of [false, true]) for (const keyboard of [false, true]) {
  for (const shift of [false, true]) for (const touch of [false, true]) for (const climbing of [false, true]) {
    let running;
    const session = { app: { setAntRunning: (value) => { running = value; } },
      isBirdActive: () => false, isClimbing: () => climbing };
    session.setAntRunning = PondGameSession.prototype.setAntRunning.bind(session);
    const context = vm.createContext({ session, canMoveAnt: () => true,
      POND_GAME: { antMovement: { desktopDefaultRunning: automatic } }, touchRunHeld: touch,
      heldMovementCodes: new Set(keyboard ? ['KeyW'] : []), heldRunCodes: new Set(shift ? ['ShiftLeft'] : []) });
    vm.runInContext(`${source}\nsyncRunning()`, context);
    assert.equal(running, !climbing && (touch || shift || (automatic && keyboard)));
    session.paused = true;
    vm.runInContext('syncRunning()', context);
    assert.equal(running, false);
  }
}
console.log('Desktop running checks passed: automatic and Shift modes, idle, touch, climbing, and pause.');
