import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MaterialState } from '../js/game/material-state.js';
import { BurrowBuilding } from '../js/game/burrow-building.js';
import { SeedToBurrowGame } from '../js/game/seed-to-burrow.js';
import { PondGameSession } from '../js/game/game-session.js';
import { createUndergroundLayout } from '../js/content/underground-layout.js';
import { BUILDING_CONFIG as CONFIG } from '../js/config/building.js';
import { POND_GAME } from '../js/config/game.js';
import { SCENE_PROPS } from '../js/config/index.js';

const sources=Array.from({length:6},(_,i)=>({id:`leaf-${i}`,x:i,z:0}));
const state=new MaterialState(sources);
assert.equal(state.pick('leaf-0'),true);
assert.equal(state.pick('leaf-1'),false,'A second object cannot enter occupied hands.');
assert.equal(state.drop('surface',{x:NaN,z:0},0),false);
assert.equal(state.deposit(),true); assert.equal(state.deposit(),false);
assert.equal(state.stored,1);
state.pick('leaf-1'); state.deposit();
assert.equal(state.build({x:2,z:2},0),true);
assert.equal(state.stored,0);
assert.equal(state.items.filter((item)=>item.state==='used').length,2);
assert.equal(state.build({x:3,z:3},0),false,'Build confirmation cannot spend twice.');
state.pick('leaf-2');state.drop('burrow',{x:1,z:3},.7);
state.pick('leaf-3');
const restored=new MaterialState(sources,JSON.parse(JSON.stringify(state.save())));
assert.equal(restored.carried.id,'leaf-3');
assert.deepEqual(restored.bed,state.bed);
assert.deepEqual(restored.items.find((item)=>item.id==='leaf-2'),state.items.find((item)=>item.id==='leaf-2'));
const bad=new MaterialState(sources,{version:1,items:[{id:'leaf-0',state:'carried'},{id:'leaf-1',state:'carried'},{id:'leaf-2',state:'used'}],bed:{x:Infinity,z:1,rotation:0}});
assert.equal(bad.items.filter((item)=>item.state==='carried').length,1);
assert.equal(bad.bed,null);
assert.equal(new MaterialState(sources,{}).stored,0,'Old saves load with empty storage.');

const world=new THREE.Group(), ant=new THREE.Group(); world.add(ant);
let climbing=false, slope=false;
const listeners=new Set();
const app={world,ant:{group:ant},worldAdditions:new Set(),gameGroundBlockers:new Map(),
  ground:{heightAt:(x,z)=>slope?x:0,containsPond:(x,z,padding=0)=>x+padding>5},
  canAntOccupy:(x,z)=>Math.abs(x)<24 && Math.abs(z)<24 && Math.hypot(x,z)>.7,
  getAntWorldPosition:(target)=>target.copy(ant.position),
  isAntAnimationBusy:()=>false,isAntFlightEnabled:()=>false,
  attachObjectToAnt:(object)=>{ant.add(object);return true;},
  addWorldObject(object){world.add(object);this.worldAdditions.add(object);return true;},
  onFrame:(listener)=>{listeners.add(listener);return()=>listeners.delete(listener);},
};
const session=new PondGameSession(null);
session.clearMovementInput=()=>{};
session.app=app; session.climbing={isClimbing:()=>climbing}; session.emitGameState=()=>{};
const game=new SeedToBurrowGame(app,{canCollectObject:()=>!session.colony?.state.carried});
session.game=game; game.root=new THREE.Group(); world.add(game.root);
const seed={visual:new THREE.Group(),position:new THREE.Vector3(-2,0,-2),baseY:0};
game.root.add(seed.visual);game.activeSeeds=[seed];
ant.position.copy(seed.position);
game.update({delta:.1,elapsed:1});
assert.equal(game.carriedSeed,null,'Walking into a seed no longer auto-collects it.');
const colony=new BurrowBuilding(session);session.colony=colony;
assert.equal(colony.actions()[0].id,'seed');
colony.act('seed'); assert.equal(game.carriedSeed,seed);
climbing=true;
assert.equal(colony.actions()[0].disabled,true,'Trees and all other climbing surfaces prohibit drops.');
assert.equal(colony.act('drop'),false);assert.equal(game.carriedSeed,seed);
climbing=false;
ant.position.set(4.8,0,0);ant.rotation.y=Math.PI/2;
assert.ok(colony.placement(),'A footprint touching the water is rejected.');
ant.position.set(-5,0,-5);ant.rotation.y=0;
assert.equal(colony.act('drop'),true);
assert.equal(game.carriedSeed,null);assert.ok(game.activeSeeds.includes(seed));
assert.equal(seed.area,'surface');
assert.equal(colony.save().droppedSeeds.length,1);
game.depositedSeedCount=POND_GAME.seed.totalCount;game.phase='complete';game.activeSeeds=[];
colony.update({delta:.2});
assert.equal(colony.state.unlocked,true);
assert.equal(colony.state.items.length,CONFIG.leafCount+CONFIG.stickCount);
const leaf=colony.state.items[0];ant.position.set(leaf.x,0,leaf.z);
assert.equal(colony.act('leaf'),true);
assert.equal(colony.meshes.get(leaf.id).parent,ant);
const carriedMesh=colony.meshes.get(leaf.id);
assert.ok(carriedMesh.children.every((child)=>child.position.z===-colony.visuals.leafGripZ),
  'The carried leaf pivots at its stem rather than its center.');
const head=new THREE.Bone(); head.name=CONFIG.leafCarry.headBone;
head.position.set(0,.025,.035);head.rotation.y=-Math.PI/2;head.scale.setScalar(.0001);ant.add(head);
colony.headBones.delete(ant);colony.updateGrip(carriedMesh);
const expectedGrip=head.localToWorld(new THREE.Vector3().copy(CONFIG.leafCarry.mouthOffset));
assert.ok(carriedMesh.getWorldPosition(new THREE.Vector3()).distanceTo(expectedGrip)<1e-10);
head.position.y+=.01;colony.update({delta:.01});
assert.ok(carriedMesh.getWorldPosition(new THREE.Vector3()).distanceTo(head.localToWorld(new THREE.Vector3().copy(CONFIG.leafCarry.mouthOffset)))<1e-10,
  'The stem follows the animated head without a per-frame model search.');
assert.equal(colony.nearestSeed(),null);
const layout=createUndergroundLayout();
const underground={active:true,scene:new THREE.Scene(),level:{layout,spawn:layout.spawn,exit:layout.exit,landmarks:layout.landmarks},player:{group:ant}};
underground.getCheckpoint = () => ({active: underground.active, position: {x: underground.position.x,z: underground.position.z},heading: 0});
underground.position=underground.player.group.position;
session.burrowLevel=underground.level; app.ground.chamber={below:()=>underground.active};underground.position.copy(layout.landmarks.store);
colony.sync();
assert.equal(colony.meshes.get(leaf.id).parent,underground.player.group,'Carried material stays on the same actor underground.');
assert.equal(colony.act('deposit'),true);
assert.equal(colony.state.stored,1);assert.equal(colony.state.carried,null);
assert.equal(colony.store.name,'Round material deposit');
assert.equal(colony.storeLeaves.filter((mesh)=>mesh.visible).length,1,'Deposit visuals match the count.');
assert.equal(colony.take(),true);assert.equal(colony.state.carried.id,leaf.id);
assert.ok(colony.storeLeaves.every((mesh)=>!mesh.visible),'An empty round deposit never displays a fake stored leaf.');
underground.position.copy(layout.landmarks.quiet);
assert.equal(colony.act('drop'),true);
assert.equal(leaf.area,'burrow');assert.equal(leaf.state,'loose');
assert.ok(colony.meshes.get(leaf.id).children.every((child)=>child.position.z===0),'Dropping restores the leaf center pivot for floor placement.');
assert.ok(Math.abs(colony.meshes.get(leaf.id).position.y-layout.heightAt(leaf.x,leaf.z)-.004)<1e-8,
  'Dropped leaves follow the contoured floor.');
underground.position.set(leaf.x,layout.heightAt(leaf.x,leaf.z),leaf.z);
assert.equal(colony.act('leaf'),true);
underground.position.copy(layout.landmarks.store);colony.act('deposit');
colony.state.pick(colony.state.items[1].id);colony.sync();colony.act('deposit');
assert.equal(colony.state.stored,2);
underground.position.copy(layout.landmarks.nest);underground.player.group.rotation.y=0;
assert.equal(colony.startPlan(),true);
const openEdge = layout.pointAt(-2,10);
assert.equal(layout.isWalkable(openEdge.x,openEdge.z,1.05),false,'This usable spot failed the former oversized chamber reserve.');
const aim = colony.facing.clone();
underground.position.set(openEdge.x-aim.x*.48,openEdge.y,openEdge.z-aim.z*.48);
assert.equal(colony.placement(true),null,'A build fits near the chamber edge with walking clearance.');
const wallEdge = layout.pointAt(-3,10);
underground.position.set(wallEdge.x-aim.x*.48,wallEdge.y,wallEdge.z-aim.z*.48);
assert.notEqual(colony.placement(true),null,'The build still cannot overlap a wall or its walking margin.');
underground.player.group.rotation.y = Math.PI/2 + THREE.MathUtils.degToRad(SCENE_PROPS.ant.yawOffset);
underground.position.set(openEdge.x-.35-.48,openEdge.y,openEdge.z);
assert.equal(layout.isWalkable(underground.position.x,underground.position.z,layout.antRadius),true);
assert.equal(layout.isWalkable(underground.position.x,underground.position.z,CONFIG.bedRadius),false);
assert.equal(colony.placement(true),null,'Standing near a wall does not reject a reachable clear destination.');
underground.player.group.rotation.y = 0;
underground.position.copy(layout.landmarks.nest);
assert.equal(colony.state.stored,2,'Previewing does not spend leaves.');
colony.act('cancel');assert.equal(colony.state.stored,2);assert.equal(colony.state.bed,null);
colony.startPlan();underground.position.copy(layout.spawn);
assert.equal(colony.act('place'),false,'An invalid preview cannot consume resources.');
assert.equal(colony.state.stored,2);underground.position.copy(layout.landmarks.nest);
assert.equal(colony.placement(true),null);
assert.equal(colony.act('place'),true);
assert.equal(colony.state.stored,0);assert.ok(colony.bed.visible);
assert.equal(colony.act('place'),false);
assert.equal(colony.planning,false);
assert.equal(colony.act('rest'),'sleep');
assert.ok(underground.position.y>layout.heightAt(underground.position.x,underground.position.z)+.04);

const saved=JSON.parse(JSON.stringify(colony.save()));assert.ok(saved.bed);
// Check seed and leaf occupancy cannot be bypassed by the old automatic offering.
colony.state.pick(colony.state.items[2].id);game.phase='offeringPickup';game.offering=new THREE.Group();
game.collectOffering();assert.equal(game.phase,'offeringPickup');
assert.equal(colony.floorClear('burrow',layout.spawn.x,layout.spawn.z,.1),true);
underground.position.copy(layout.spawn);
assert.equal(colony.placement(),'building.entranceClear');
underground.active=false;colony.sync();
assert.equal(colony.meshes.get(colony.state.carried.id).parent,ant);
slope=true;assert.equal(colony.floorClear('surface',-4,-4,.14),false,'Steep slopes reject placement.');
app.getAntFacingDirection=(target)=>target.set(0,0,1);
session.objectives={getSaveState:()=>({completed:[]})};
const slot=JSON.parse(JSON.stringify(session.getSaveState()));
assert.equal(slot.version,1);assert.ok(slot.game);assert.ok(slot.objectives);
assert.equal(slot.colony.items.find((item)=>item.state==='carried').id,colony.state.carried.id);
colony.dispose();assert.equal(listeners.size,0);assert.equal(colony.surface.parent,null);
slope=false;
const reloaded=new BurrowBuilding(session,slot.colony);session.colony=reloaded;reloaded.sync();
assert.deepEqual(reloaded.state.bed,slot.colony.bed,'Buildings survive the existing slot JSON round trip.');
assert.equal(reloaded.meshes.get(reloaded.state.carried.id).parent,ant,'A carried material safely resumes outside after reload.');
assert.equal(reloaded.state.items.filter((item)=>item.state==='used').length,2);
const testBed = reloaded.state.bed;
if (testBed) {
  assert.ok(reloaded.walkLift(testBed.x,testBed.z)>0);
  assert.equal(reloaded.walkLift(testBed.x+1,testBed.z),0);
  assert.ok(Math.abs(reloaded.walkLift(testBed.x+.359,testBed.z)-reloaded.walkLift(testBed.x+.36,testBed.z))<.001);
}
reloaded.dispose();assert.equal(listeners.size,0);
game.sound.dispose();session.objectiveChime.dispose();
console.log('Burrow building checks passed: ownership, saves, explicit pickup, carry transfer, placement constraints, storage, preview, cost, and cleanup.');
