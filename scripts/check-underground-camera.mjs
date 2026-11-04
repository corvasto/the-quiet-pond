import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UndergroundWorld } from '../js/game/underground.js';
import { createUndergroundLayout } from '../js/content/underground-layout.js';
import { UNDERGROUND_CONFIG } from '../js/config/underground.js';

const layout=createUndergroundLayout();
const world=new UndergroundWorld({camera:new THREE.PerspectiveCamera(55,1.7,.1,700)});
world.level={layout};world.player={group:new THREE.Group()};world.position=world.player.group.position;
world.cameraLight=new THREE.PointLight();world.ready=true;world.active=true;
world.controls={target:new THREE.Vector3(),enableDamping:true,update(){}};
const radius=UNDERGROUND_CONFIG.camera.collisionRadius;
let queries=0,maxQueries=0;
const containsSphere=layout.containsSphere;
layout.containsSphere=(...args)=>{queries++;return containsSphere(...args);};
function place(x,z) {
  world.position.set(x,layout.heightAt(x,z)+.006,z);world.resetCamera();
}
function desired(yaw,distance=1.1,height=.27) {
  const horizontal=Math.sqrt(Math.max(.001,distance*distance-height*height));
  world.orbitCamera.position.copy(world.controls.target).add(new THREE.Vector3(Math.sin(yaw)*horizontal,height,Math.cos(yaw)*horizontal));
}
function verify() {
  assert.ok(layout.containsSphere(world.camera.position.x,world.camera.position.y,world.camera.position.z,radius),'Camera remains inside the earth.');
  assert.equal(world.player.group.visible,true);
  world.camera.updateMatrixWorld();
  const projected=world.position.clone().add(new THREE.Vector3(0,.04,0)).project(world.camera);
  assert.ok(Math.abs(projected.x)<.98&&Math.abs(projected.y)<.98,'The ant remains framed.');
}
// Keep orbiting into the side wall. The camera constrains angle rather than zooming.
place(layout.spawn.x+.72,layout.spawn.z+1.3);
const lengths=[];let maximumStep=0;let previous=world.camera.position.clone();
for(let frame=0;frame<240;frame++) {
  const offset=world.orbitCamera.position.clone().sub(world.controls.target);
  const yaw=Math.atan2(offset.x,offset.z)+.025;
  desired(yaw);queries=0;world.updateCamera(1/60);maxQueries=Math.max(maxQueries,queries);verify();
  lengths.push(world.lastCameraOffset.length());
  maximumStep=Math.max(maximumStep,world.camera.position.distanceTo(previous));previous.copy(world.camera.position);
  assert.ok(Math.abs(world.orbitCamera.position.distanceTo(world.controls.target)-1.1)<1e-8,'Wall orbit retains the user zoom request.');
}
assert.ok(Math.max(...lengths)-Math.min(...lengths)<.08,'Sustained wall orbit does not pump camera distance.');
assert.ok(maximumStep<.12,'Constrained orbit does not jump to an opposite shoulder.');
assert.ok(maxQueries<2500,'Wall orbit keeps collision work bounded.');
// Without input, a constrained view is stable instead of alternating search results.
const idle=world.camera.position.clone();
for(let frame=0;frame<180;frame++){world.updateCamera(1/60);verify();}
assert.ok(world.camera.position.distanceTo(idle)<.02,'An idle wall view settles.');
// Approach and retreat from the wall; any outward return is gradual.
place(layout.spawn.x,layout.spawn.z+1.3);desired(Math.PI/2);world.updateCamera(0);
let lastDistance=world.lastCameraOffset.length(),maxOutward=0;
for(let frame=0;frame<240;frame++) {
  const x=layout.spawn.x+(frame<120?frame:240-frame)/120*.78;
  world.position.set(x,layout.heightAt(x,layout.spawn.z+1.3)+.006,layout.spawn.z+1.3);
  world.updateCamera(1/60);verify();
  const distance=world.lastCameraOffset.length();maxOutward=Math.max(maxOutward,distance-lastDistance);lastDistance=distance;
}
assert.ok(maxOutward<.08,'Outward recovery after a wall is smooth.');
// Turn through a junction at walking speed while keeping collisions bounded.
place(layout.spawn.x,layout.spawn.z+3);
for(let frame=0;frame<240;frame++) {
  const z=layout.spawn.z+3+Math.min(frame,160)/160*2.1;
  const x=layout.spawn.x-Math.max(0,frame-160)/80*.6;
  if(layout.isWalkable(x,z,.15))world.position.set(x,layout.heightAt(x,z)+.006,z);
  world.updateCamera(1/60);verify();
}
console.log('Underground camera checks passed: constrained orbit, retained zoom, stable idle, safe corners, framing, and smooth recovery.');
