import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PondGameSession } from '../js/game/game-session.js';
import { AntGroundTrail } from '../js/game/ant-ground-trail.js';
import { ANT_TRAIL_CONFIG as CONFIG } from '../js/config/ant-trail.js';
import { SCENE_PROPS } from '../js/config/index.js';

function fixture() {
  const state = {water:false,climbing:false,flight:false,bird:false,underground:false,busy:false,blocked:false};
  const ground = {heightAt:(x,z)=>x*.1+z*.05,containsPond:()=>state.water};
  const position = new THREE.Vector3();
  const listeners = new Set(), world = new THREE.Group();
  const app = {ground,canAntOccupy:()=>!state.blocked,isAntAnimationBusy:()=>state.busy,
    getAntWorldPosition:(target)=>target.copy(position),
    addWorldObject:(object)=>world.add(object),removeWorldObject:(object)=>object.removeFromParent(),
    onFrame(callback){listeners.add(callback);return()=>listeners.delete(callback);},
  };
  const session = {app,paused:false,exploreActive:false,isBelowGround:()=>state.underground,
    isClimbing:()=>state.climbing,isFlightEnabled:()=>state.flight,isBirdActive:()=>state.bird};
  const move = (x,z=0,elevation=0) => position.set(x,ground.heightAt(x,z)+SCENE_PROPS.ant.lift+SCENE_PROPS.ant.offset.y+elevation,z);
  move(0);
  const trail = new AntGroundTrail(session);
  return {trail,session,state,position,world,listeners,move};
}
const scene = fixture(), trail = scene.trail;
const positions = trail.positions.array, colors = trail.colors.array;
trail.update({delta:1/60});
for(let i=0;i<10;i++)trail.update({delta:1/60});
assert.equal(trail.emittedMarks,0,'Stationary ants do not leave marks.');
scene.move(.12);trail.update({delta:1/30});
assert.ok(trail.activeCount>=2);
assert.equal(trail.mesh.visible,true);
assert.equal(trail.emittedMarks%2,0,'Walking leaves paired marks.');
for(let slot=0;slot<CONFIG.capacity;slot++) if(trail.expires[slot]) for(let corner=0;corner<4;corner++) {
  const vertex = slot*4+corner;
  assert.ok(Math.abs(trail.positions.getY(vertex)-scene.session.app.ground.heightAt(trail.positions.getX(vertex),trail.positions.getZ(vertex))-CONFIG.groundOffset)<1e-7,
    'Each mark follows the contoured soil.');
}
const initialAlpha = trail.colors.getW(0);
trail.update({delta:1});
assert.ok(trail.colors.getW(0)>0 && trail.colors.getW(0)<initialAlpha,'Marks fade rather than disappear abruptly.');
trail.update({delta:1.01});
assert.equal(trail.activeCount,0);assert.equal(trail.mesh.visible,false);
for(const flag of ['water','climbing','flight','bird','underground','busy','blocked']) {
  scene.state[flag]=true;
  const before = trail.emittedMarks;
  scene.move(scene.position.x+.1);trail.update({delta:.02});
  assert.equal(trail.emittedMarks,before,`${flag} cannot emit soil marks.`);
  scene.state[flag]=false;
  trail.update({delta:.02});
}
for(const flag of ['paused','exploreActive']) {
  scene.session[flag]=true;
  const before = trail.emittedMarks;
  scene.move(scene.position.x+.1);trail.update({delta:.02});
  assert.equal(trail.emittedMarks,before);
  scene.session[flag]=false;trail.update({delta:.02});
}
const beforeRock = trail.emittedMarks;
scene.move(scene.position.x+.1,0,.15);trail.update({delta:.02});
assert.equal(trail.emittedMarks,beforeRock,'Raised rock or prop support does not mark the soil below.');
scene.move(scene.position.x);trail.update({delta:.02});
scene.move(scene.position.x+2);trail.update({delta:.02});
assert.equal(trail.emittedMarks,beforeRock,'Teleports do not draw a trail across the map.');
for(let i=0;i<600;i++) {scene.move(scene.position.x+.02);trail.update({delta:1/120});}
assert.ok(trail.emittedMarks>CONFIG.capacity);
assert.ok(trail.activeCount<=CONFIG.capacity);
assert.equal(trail.positions.array,positions);assert.equal(trail.colors.array,colors);
assert.equal(scene.world.children.length,1,'All marks share one scene object.');
let disposed = 0;
trail.geometry.addEventListener('dispose',()=>disposed++);trail.material.addEventListener('dispose',()=>disposed++);
trail.dispose();assert.equal(disposed,2);assert.equal(scene.world.children.length,0);assert.equal(scene.listeners.size,0);
function emissionRate(fps) {
  const run=fixture();run.trail.update({delta:0});
  for(let i=1;i<=fps;i++){run.move(.6*i/fps);run.trail.update({delta:1/fps});}
  const count=run.trail.emittedMarks;run.trail.dispose();return count;
}
assert.ok(Math.abs(emissionRate(30)-emissionRate(60))<=2,'Distance spacing remains consistent across frame rates.');
console.log('Ant soil trail checks passed: movement, paired marks, contour alignment, fade, surface exclusions, bounded reuse, and cleanup.');

const managedScene = fixture();
managedScene.trail.dispose();
const managedSession = new PondGameSession(null);
assert.equal(managedSession.antTrailsEnabled,false,'New sessions default to trails off.');
assert.equal(managedSession.antTrail,null);
managedSession.app = managedScene.session.app; managedSession.colony = {};
managedSession.setAntTrailsEnabled(false);
assert.equal(managedScene.listeners.size,0,'Disabled trails register no frame work.');
assert.equal(managedScene.world.children.length,0,'Disabled trails allocate no scene geometry.');
managedSession.setAntTrailsEnabled(true);
const enabledTrail = managedSession.antTrail;
assert.equal(managedScene.listeners.size,1);assert.equal(managedScene.world.children.length,1);
managedSession.setAntTrailsEnabled(true);
assert.equal(managedSession.antTrail,enabledTrail,'Repeated enabling does not duplicate the trail.');
let settingDisposals = 0;
enabledTrail.geometry.addEventListener('dispose',()=>settingDisposals++);
enabledTrail.material.addEventListener('dispose',()=>settingDisposals++);
managedSession.setAntTrailsEnabled(false);
assert.equal(settingDisposals,2);assert.equal(managedSession.antTrail,null);
assert.equal(managedScene.listeners.size,0);assert.equal(managedScene.world.children.length,0);
managedSession.setAntTrailsEnabled(true);
assert.notEqual(managedSession.antTrail,enabledTrail,'Re-enabling starts a fresh empty trail.');
assert.equal(managedSession.antTrail.activeCount,0);
managedSession.setAntTrailsEnabled(false);
managedSession.objectiveChime.dispose();
