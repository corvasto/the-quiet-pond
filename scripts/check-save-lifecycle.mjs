import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../js/main.js',import.meta.url),'utf8');
const start = source.indexOf("window.addEventListener('pagehide'");
const end = source.indexOf('\nregisterGameServiceWorker();',start);
assert.ok(start>=0 && end>start);
const handlers = new Map(), calls = [];
let live = true, persisted = null, failCleanup = false;
runInNewContext(source.slice(start,end), {
  window: {addEventListener:(name,callback)=>handlers.set(name,callback),clearTimeout(){}},
  saveActiveSlot() { if(live) { calls.push('save'); persisted={underground:{active:true}}; } },
  gameplayLayout: {dispose(){calls.push('cleanup');if(failCleanup)throw new Error('cleanup failed');}},
  mapViewport:{dispose(){}}, debugControls:{dispose(){}},
  buildingNoticeTimer:null, saveTimeout:null, performanceDiagnosticUnsubscribe:null, mobileMovementCleanup:null,
  session:{dispose(){live=false;}},
});
handlers.get('pagehide')();
assert.equal(persisted.underground.active,true,'Page hide saves without relying on beforeunload.');
calls.length=0;
handlers.get('beforeunload')();
assert.deepEqual(calls,['save','cleanup'],'Saving precedes every UI or runtime cleanup.');
handlers.get('pagehide')();
assert.equal(persisted.underground.active,true,'A later pagehide cannot overwrite the saved area after disposal.');
live=true; persisted=null; failCleanup=true;
assert.throws(()=>handlers.get('beforeunload')(),/cleanup failed/);
assert.equal(persisted.underground.active,true,'Even failed UI cleanup preserves the saved checkpoint.');
console.log('Save lifecycle checks passed: pagehide, save ordering, disposed sessions, and cleanup failures.');
