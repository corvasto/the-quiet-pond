import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AntBoost } from '../js/game/ant-boost.js';
import { ANT_BOOST_CONFIG } from '../js/config/ant-boost.js';
const world = new THREE.Group();
let multiplier = 1, unsubscribed = false, climbing = false, bird = false, flight = false;
const app = { antVelocity: new THREE.Vector3(0,0,0.3), antMovementInput: new Set(['forward']),
  antMovementAxes: new THREE.Vector2(), addWorldObject: (mesh) => world.add(mesh),
  removeWorldObject: (mesh) => mesh.removeFromParent(), onFrame: () => () => { unsubscribed = true; },
  setAntBoostMultiplier: (value) => { multiplier = value; }, getAntWorldPosition: (target) => target.set(1,-1,2) };
const session = { app, paused: false, exploreActive: false, isClimbing: () => climbing,
  isBirdActive: () => bird, isFlightEnabled: () => flight, setAntRunning() {} };
const boost = new AntBoost(session);
boost.setHeld(true); assert.ok(boost.active); assert.equal(multiplier, ANT_BOOST_CONFIG.speedMultiplier);
boost.update({delta: 1}); assert.equal(boost.remaining,4); assert.ok(boost.mesh.visible);
boost.setHeld(false); boost.update({delta: 10}); assert.equal(boost.remaining,4); assert.equal(multiplier,1);
boost.setHeld(true); app.antVelocity.set(0,0,0); boost.update({delta:10});
assert.equal(boost.remaining,4,'A stationary or blocked ant spends no charge'); assert.equal(multiplier,1);
app.antVelocity.z=0.3; app.antMovementInput.clear(); boost.update({delta:10});
assert.equal(boost.remaining,4,'Braking after input release spends no charge'); app.antMovementInput.add('forward');
for (const property of ['paused','exploreActive']) {
  session[property]=true; boost.update({delta:10}); assert.equal(boost.remaining,4); assert.equal(multiplier,1);
  session[property]=false;
}
for (const mode of ['climb','bird','flight']) {
  climbing=mode==='climb'; bird=mode==='bird'; flight=mode==='flight';
  boost.update({delta:10}); assert.equal(boost.remaining,4); assert.equal(multiplier,1);
}
climbing=bird=flight=false;
boost.update({delta:4}); assert.equal(boost.remaining,0); assert.equal(boost.cooldown,20); assert.equal(multiplier,1);
boost.update({delta:10}); assert.equal(boost.progress,0.5);
session.paused=true; boost.update({delta:10}); assert.equal(boost.cooldown,10); session.paused=false;
boost.update({delta:10}); assert.equal(boost.remaining,5); assert.ok(boost.active);
boost.setHeld(false); assert.equal(boost.active,false);
boost.update({delta:30}); assert.equal(boost.remaining,5,'A recharged idle boost is not spent');
boost.setHeld(true); boost.update({delta:7}); assert.equal(boost.cooldown,18);
assert.equal(world.children.filter((object)=>object.isLight).length,0,'The aura emits no light through terrain');
let disposed=0; boost.geometry.addEventListener('dispose',()=>disposed++);
boost.dispose(); assert.ok(unsubscribed); assert.equal(world.children.length,0); assert.equal(disposed,1); assert.equal(multiplier,1);
const disabled=new AntBoost(session,{...ANT_BOOST_CONFIG,enabled:false});
disabled.setHeld(true); assert.equal(disabled.active,false); assert.equal(disabled.mesh,undefined); disabled.dispose();
console.log('Ant boost checks passed: hold and move, charge conservation, blocking, pause/map, modes, recharge, aura, and cleanup.');
