import { captureSurfaceMap, createSurfaceMapCamera } from '../js/core/surface-map.js';
import { getMapBounds } from '../js/utils/map-bounds.js';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createUndergroundLayout } from '../js/content/underground-layout.js';
import { createUnderground } from '../js/generators/underground.js';
import { renderUndergroundMap, createMapViewport } from '../js/ui/underground-map.js';
import { UndergroundWorld } from '../js/game/underground.js';
import { UNDERGROUND_CONFIG } from '../js/config/underground.js';
import { installPondAntNavigationMethods } from '../js/core/app-ant-navigation.js';
import { SCENE_PROPS } from '../js/config/index.js';
import { ANT_MOVEMENT_CONFIG } from '../js/config/world.js';
import { trackGroundOrbit } from '../js/utils/player-motion.js';
import { PondGameSession } from '../js/game/game-session.js';

// Exercise mobile pinch, mouse drag/wheel, fit, zoom limits, and teardown.
const mapListeners=new Map();
let viewBox='-5 -4 20 16';
const svgStub={getAttribute:()=>viewBox,setAttribute:(_name,value)=>{viewBox=value;},
  getBoundingClientRect:()=>({left:0,top:0,width:320,height:400})};
const mapContainer={clientWidth:320,querySelector:()=>svgStub,
  addEventListener:(name,handler)=>mapListeners.set(name,handler),
  removeEventListener:(name)=>mapListeners.delete(name),setPointerCapture(){},hasPointerCapture:()=>false};
let zoomPercent=0;
const viewport=createMapViewport(mapContainer,(value)=>{zoomPercent=value;});
viewport.reset({x:0,z:0});
assert.equal(zoomPercent,160,'Mobile opens closer to the player.');
viewport.fit(); assert.equal(zoomPercent,100);
viewport.zoom(2); assert.equal(zoomPercent,200);
const beforePan=viewBox.split(' ').map(Number);
const pointer=(pointerId,x,y)=>({pointerId,clientX:x,clientY:y,button:0,preventDefault(){}});
mapListeners.get('pointerdown')(pointer(1,100,100));
mapListeners.get('pointermove')(pointer(1,120,110));
assert.ok(viewBox.split(' ').map(Number)[0]<beforePan[0],'Dragging pans the map.');
mapListeners.get('pointerdown')(pointer(2,220,110));
mapListeners.get('pointermove')(pointer(2,270,110));
assert.equal(zoomPercent,300,'Spreading two fingers zooms around their midpoint.');
mapListeners.get('pointercancel')(pointer(2,270,110));
viewport.clear();
mapListeners.get('wheel')({deltaY:-100,clientX:160,clientY:200,preventDefault(){}});
assert.ok(zoomPercent>300,'Wheel zoom works on desktop.');
viewport.zoom(1e9); assert.equal(zoomPercent,600);
viewport.zoom(1e-9); assert.equal(zoomPercent,100);
assert.ok(Math.abs(viewBox.split(' ').map(Number)[2]/viewBox.split(' ').map(Number)[3]-20/16)<1e-10,
  'Zoom preserves aspect and relative world scale.');
viewport.dispose(); assert.equal(mapListeners.size,0);

const layout = createUndergroundLayout();
const visited = new Set(['0,0']);
const queue = [[0, 0]];
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const [column, row] = queue[cursor];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const key = `${column + dc},${row + dr}`;
    if (layout.hasCell(column + dc, row + dr) && !visited.has(key)) {
      visited.add(key);
      queue.push([column + dc, row + dr]);
    }
  }
}
assert.equal(visited.size, layout.cells.length, 'Every chamber connects to the entrance.');
for (const route of layout.workerRoutes) {
  for (let index = 0; index < route.length; index += 1) {
    const start = route[index];
    const end = route[(index + 1) % route.length];
    for (let step = 0; step <= 100; step += 1) {
      const alpha = step / 100;
      assert.ok(layout.isWalkable(start.x + (end.x - start.x) * alpha,
        start.z + (end.z - start.z) * alpha, 0.1), 'Worker routes stay inside the tunnels.');
    }
  }
}
const corner = layout.pointAt(1, -1);
assert.equal(layout.isWalkable(corner.x + layout.cellSize * 0.49,
  corner.z - layout.cellSize * 0.49, 0.15), false, 'A circle cannot squeeze through a solid corner.');
assert.equal(layout.containsSphere(layout.spawn.x, layout.floorY + 0.05, layout.spawn.z, 0.13), false);
assert.equal(layout.containsSphere(layout.spawn.x, layout.roofAt(layout.spawn.x,layout.spawn.z) - 0.05, layout.spawn.z, 0.13), false);

const level = createUnderground({ seedCount: 3 });
const floor = level.group.getObjectByName('Packed earth floor');
const ceiling = level.group.getObjectByName('Solid earth ceiling');
assert.ok(floor.geometry.index.count > layout.cells.length * 6);
assert.ok(ceiling.geometry.index.count > layout.cells.length * 6, 'All cells have a continuous subdivided roof.');
// Every shell edge has a partner, including wall corners and roof joins.
const edges = new Map();
for (const name of ['Packed earth floor','Solid earth ceiling','Enclosed soil walls']) {
  const mesh = level.group.getObjectByName(name);
  const positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.index;
  const key = (i) => [positions.getX(i),positions.getY(i),positions.getZ(i)]
    .map((v)=>Math.round(v*10000)).join(',');
  for(let i=0;i<indices.count;i+=3) {
    const ids=[key(indices.getX(i)),key(indices.getX(i+1)),key(indices.getX(i+2))];
    for(let j=0;j<3;j++) {
      const pair=[ids[j],ids[(j+1)%3]].sort().join('|');
      edges.set(pair,(edges.get(pair)??0)+1);
    }
  }
}
assert.equal([...edges.values()].filter((count)=>count!==2).length,0,
  'The complete earth lining has no unpaired edges or open wall seams.');
const taproot = level.group.getObjectByName('Curved tree taproot');
assert.ok(taproot);
const rootPositions = taproot.geometry.getAttribute('position');
const rootNormals = taproot.geometry.getAttribute('normal');
assert.ok(rootNormals.getX(11)*(rootPositions.getX(11)-layout.treePosition.x)
  + rootNormals.getZ(11)*(rootPositions.getZ(11)-layout.treePosition.z)>0,
  'The root surface faces outward and remains visible from the tunnel.');
assert.equal(level.group.children.filter((o)=>o.geometry?.type==='CylinderGeometry').length,0,
  'Roots use curved tapered geometry instead of straight cylinder rods.');

const heights = floor.geometry.getAttribute('position');
let minHeight = Infinity, maxHeight = -Infinity;
for (let i=0; i<heights.count; i++) { minHeight = Math.min(minHeight, heights.getY(i)); maxHeight = Math.max(maxHeight, heights.getY(i)); }
assert.ok(maxHeight-minHeight > 0.2, 'The earth floor has visible continuous contours.');
const treeLayout = createUndergroundLayout({treePosition:{x:2.6,z:1.2}});
assert.equal(treeLayout.isWalkable(2.6,1.2,0.1), false, 'The actual tree root is solid.');
assert.ok(treeLayout.isWalkable(3.3,1.2,0.15), 'A chamber surrounds the root.');
let disposedLevelGeometry = 0;
floor.geometry.addEventListener('dispose', () => { disposedLevelGeometry += 1; });
level.dispose();
level.dispose();
assert.equal(disposedLevelGeometry, 1, 'Shared procedural geometry is disposed once.');

const sharedBark=new THREE.MeshStandardMaterial({map:new THREE.Texture(),normalMap:new THREE.Texture(),roughnessMap:new THREE.Texture()});
let textureDisposals=0,materialDisposals=0;
for(const texture of [sharedBark.map,sharedBark.normalMap,sharedBark.roughnessMap]) texture.addEventListener('dispose',()=>{textureDisposals++;});
sharedBark.addEventListener('dispose',()=>{materialDisposals++;});
const texturedLevel=createUnderground({barkMaterial:sharedBark});
const texturedRoot=texturedLevel.group.getObjectByName('Curved tree taproot');
assert.notEqual(texturedRoot.material,sharedBark,'Interior owns its cloned material.');
for(const key of ['map','normalMap','roughnessMap']) assert.equal(texturedRoot.material[key],sharedBark[key],
  'The root reuses the exact surface bark textures without another download.');
assert.equal(texturedRoot.geometry.attributes.uv.count,texturedRoot.geometry.attributes.position.count);
assert.ok(texturedRoot.geometry.attributes.uv.getY(24*11)>0,'Bark UVs follow distance along the curved root.');
texturedLevel.dispose();
assert.equal(textureDisposals,0,'Disposing the interior preserves surface textures.');
assert.equal(materialDisposals,0,'Disposing the interior preserves the surface material.');
for(const texture of [sharedBark.map,sharedBark.normalMap,sharedBark.roughnessMap]) texture.dispose();
sharedBark.dispose();

const listeners = new Map();
const documentStub = {
  addEventListener(name, listener) { listeners.set(listener, name); },
  removeEventListener(name, listener) { listeners.delete(listener); },
};
const canvas = {
  ...documentStub,
  style: {},
  ownerDocument: documentStub,
  getRootNode: () => documentStub,
  clientWidth: 1200,
  clientHeight: 800,
};
const surfaceRoot = new THREE.Group();
const surfaceGeometry = new THREE.BoxGeometry(0.09, 0.03, 0.06);
const surfaceMaterial = new THREE.MeshStandardMaterial();
const authoredModel = new THREE.Group();
authoredModel.add(new THREE.Mesh(surfaceGeometry, surfaceMaterial));
surfaceRoot.add(authoredModel);
const carriedSeed = new THREE.Group();
carriedSeed.name = 'Surface carried seed';
surfaceRoot.add(carriedSeed, new THREE.PointLight());
surfaceRoot.position.set(3, 0, 4);
const surfacePosition = surfaceRoot.position.clone();
let disposedSurface = 0;
surfaceGeometry.addEventListener('dispose', () => { disposedSurface += 1; });
surfaceMaterial.addEventListener('dispose', () => { disposedSurface += 1; });
const discoveries = [];
const app = {
  camera: new THREE.PerspectiveCamera(55, 1.5, 0.1, 700),
  renderer: { domElement: canvas },
  ant: { group: surfaceRoot, animations: [] },
};
const world = new UndergroundWorld(app, { onDiscovery: (key) => discoveries.push(key) });
const progress = [];
await world.start({ seedCount: 4, onProgress: (value) => progress.push(value) });
assert.equal(world.active, false, 'Preparation does not activate the underground world.');
assert.equal(world.ready, true);
assert.equal(progress.at(-1), 100);
assert.equal(world.player.group.children.length, 1, 'Surface attachments are excluded from the clone.');
assert.equal(world.player.group.children[0].children[0].geometry, surfaceGeometry,
  'The existing model geometry is reused without a second download.');
assert.equal(world.activate(), true);
assert.equal(world.canExit(), true);
world.setMovementKey('forward', true);
for (let frame = 0; frame < 60; frame += 1) world.update({ delta: 1 / 60 });
assert.ok(world.position.z > layout.spawn.z + 0.2, 'Forward moves into the entry tunnel.');
world.setMovementKey('right', true);
for (let frame = 0; frame < 240; frame += 1) world.update({ delta: 1 / 60 });
assert.ok(layout.isWalkable(world.position.x, world.position.z, UNDERGROUND_CONFIG.antRadius),
  'Sustained diagonal input slides along walls without crossing them.');
assert.ok(layout.containsSphere(world.camera.position.x, world.camera.position.y,
  world.camera.position.z, UNDERGROUND_CONFIG.camera.collisionRadius),
'Hugging a tunnel wall still leaves clearance for the camera near plane.');
world.position.copy(layout.landmarks.nest);
world.resetCamera();
const pausedPosition = world.position.clone();
world.setPaused(true);
world.update({ delta: 1 });
assert.deepEqual(world.position.toArray(), pausedPosition.toArray());
world.setPaused(false);
world.setExploreActive(true);
world.setMovementKey('forward', true);
for (let i=0; i<60; i++) world.update({ delta: 1/60 });
assert.deepEqual(world.position.toArray(), pausedPosition.toArray(), 'Explore leaves the ant in place.');
assert.equal(world.controls.enabled,false,'Map suspends the canvas orbit controls.');
const mapData=world.getMapData();
assert.deepEqual(mapData.position,{x:world.position.x,z:world.position.z},'The map uses underground coordinates rather than the parked surface ant.');
const markup=renderUndergroundMap(mapData,(key)=>key);
assert.ok(markup.includes('underground-map__player'));
assert.ok(markup.includes(`translate(${world.position.x} ${world.position.z})`));
assert.ok(markup.includes(`cx="${layout.treePosition.x}" cy="${layout.treePosition.z}"`));
assert.ok(markup.includes('underground.map.entrance'));
assert.ok(level.group.getObjectByName('Daylight at surface entrance'));
world.setPaused(true); world.setPaused(false);
assert.equal(world.controls.enabled,false,'Pause/resume does not enable controls beneath the map.');
world.setExploreActive(false);
world.clearInput();

// Compare the actual surface and underground movement over input changes and orbit.
class SurfaceHarness {}
installPondAntNavigationMethods(SurfaceHarness);
const surface = new SurfaceHarness();
world.clearInput(); world.position.copy(layout.landmarks.nest); world.resetCamera();
Object.assign(surface, {
  activeView:'ant', ant:{group:new THREE.Group()}, ground:{},
  antMovement:ANT_MOVEMENT_CONFIG, antMovementInput:new Set(), antMovementAxes:new THREE.Vector2(),
  antResolvedAxes:{}, antVelocity:new THREE.Vector3(), antDisplacement:new THREE.Vector3(),
  antForward:new THREE.Vector3(), antRight:new THREE.Vector3(), antMoveDirection:new THREE.Vector3(),
  camera:world.camera, controls:world.controls,
  recoverAntFromCollision:()=>true, setAntAnimationPlaying:()=>{},
  moveAntTo(x,z) { this.ant.group.position.x=x; this.ant.group.position.z=z; return true; },
});
surface.ant.group.position.copy(world.position);
surface.ant.group.rotation.copy(world.player.group.rotation);
world.manualDelay=100;
for(let frame=0;frame<120;frame++) {
  const right=frame>=30 && frame<90, forward=frame<30 || (frame>=60 && frame<90);
  surface.antMovementInput.clear(); world.keys.clear();
  if(right) {surface.antMovementInput.add('right'); world.keys.add('right');}
  if(forward) {surface.antMovementInput.add('forward'); world.keys.add('forward');}
  if(frame===20 || frame===65) {
    const before=world.orbitCamera.position.clone().sub(world.controls.target);
    const angle=0.7;
    const after=before.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle);
    world.orbitCamera.position.copy(world.controls.target).add(after);
    world.camera.position.copy(world.orbitCamera.position);
    trackGroundOrbit(world,before.x,before.z,after.x,after.z);
    trackGroundOrbit(surface,before.x,before.z,after.x,after.z);
  }
  surface.updateAntMovement(1/60); world.updateMovement(1/60);
  assert.ok(Math.abs(surface.ant.group.position.x-world.position.x)<1e-8
    && Math.abs(surface.ant.group.position.z-world.position.z)<1e-8,
    'Actual surface and interior movement agree through input changes and camera orbit.');
  assert.ok(Math.abs(surface.ant.group.rotation.y-world.player.group.rotation.y)<1e-8,
    'Body turning also agrees with the surface controller.');
}
world.clearInput(); world.manualDelay=0;

// Sideways-only movement matches surface speed and never spins the camera.
for (const direction of ['left','right']) {
  world.position.copy(layout.landmarks.nest);
  world.clearInput(); world.resetCamera();
  world.setMovementKey(direction,true);
  const start = world.position.clone();
  const before = world.orbitCamera.position.clone().sub(world.target);
  for (let i=0; i<60; i++) world.update({delta:1/60});
  const after = world.orbitCamera.position.clone().sub(world.target);
  assert.ok(Math.abs(world.position.x-start.x) > 0.2, 'A/D translates sideways.');
  assert.ok(Math.abs(world.position.z-start.z) < 0.001, 'A/D travels straight without W.');
  assert.ok(before.distanceTo(after) < 0.001, 'A/D leaves camera orbit unchanged.');
}
world.clearInput();

// Exercise main's actual key handler as well as the controller routing.
const mainSource = await readFile(new URL('../js/main.js',import.meta.url),'utf8');
const begin = mainSource.indexOf("window.addEventListener('keydown', (event) => {");
const end = mainSource.indexOf("window.addEventListener('keyup'",begin);
let keydown, underground = false;
const routed = [];
runInNewContext(mainSource.slice(begin,end), {
  window:{addEventListener:(_name,handler)=>{keydown=handler;}},
  sleepTransition:false, burrowTransition:false,
  elements:new Proxy({}, {get:()=>({hidden:true})}),
  session:{isExploreActive:()=>true, isUnderground:()=>underground, canPlayBird:()=>false, unlockSound:()=>{}},
  isEditableTarget:()=>false, paused:false,
  debugControls:{handleKeyDown:()=>false},
  antMovementKeys:new Map([['KeyW','forward']]), heldMovementCodes:new Set(),
  canMoveAnt:()=>true, syncMovementDirection:(value)=>routed.push(value),
});
keydown({code:'KeyW',repeat:false,preventDefault(){}});
assert.deepEqual(routed,[], 'Surface Explore keeps its original keyboard behavior.');
underground=true;
keydown({code:'KeyW',repeat:false,preventDefault(){}});
assert.deepEqual(routed,[], 'Keyboard movement is blocked while the underground map is open.');

// Exercise all orbit headings and elevations beside walls and inside rooms.
for (const point of [layout.spawn, layout.landmarks.nest, layout.landmarks.roots]) {
  world.position.copy(point);
  world.position.y += 0.006;
  world.resetCamera();
  for (let turn = 0; turn < 32; turn += 1) {
    for (const height of [-0.3, 0.4, 2]) {
      world.orbitCamera.position.copy(world.target).add(new THREE.Vector3(
        Math.sin(turn * Math.PI / 16) * 2.3, height, Math.cos(turn * Math.PI / 16) * 2.3));
      world.updateCamera(0);
      assert.ok(layout.containsSphere(world.camera.position.x, world.camera.position.y,
        world.camera.position.z, UNDERGROUND_CONFIG.camera.collisionRadius),
      'Every rendered orbit position keeps the camera sphere inside the earth boundaries.');
      world.camera.updateMatrixWorld();
      const projected=world.position.clone().add(new THREE.Vector3(0,0.04,0)).project(world.camera);
      assert.ok(Math.abs(projected.x)<0.95 && Math.abs(projected.y)<0.95,
        'The camera frames the ant body even when a requested orbit is obstructed.');
      assert.equal(world.player.group.visible,true,'Tight camera orbit never hides the ant.');
      assert.ok(world.camera.position.distanceTo(world.position) > 0.25,
        'Obstructed orbits retain enough room to frame the ant.');
    }
  }
}

// A desired camera endpoint in another room must not skip intervening soil.
world.position.copy(layout.landmarks.nest);
world.position.y += 0.006;
world.resetCamera();
world.controls.maxDistance = 30;
world.orbitCamera.position.copy(layout.landmarks.quiet);
world.orbitCamera.position.y += 0.4;
world.updateCamera(0);
assert.ok(world.camera.position.distanceTo(world.target) < world.orbitCamera.position.distanceTo(world.target) - 1,
  'The sweep stops at the first wall even when the far endpoint is in an open room.');
app.camera.aspect = 3.5;
world.updateCamera(0);
assert.equal(world.camera.aspect, 3.5, 'The underground camera follows viewport resizing.');
world.position.copy(layout.spawn);
world.resetCamera();
const updateControls = world.controls.update;
world.controls.update = () => {};
world.orbitCamera.position.copy(world.target);
world.updateCamera(0);
assert.ok(world.camera.position.distanceTo(world.target) > 0,
  'A degenerate orbit gets a safe nonzero camera offset.');
assert.ok(world.camera.quaternion.toArray().every(Number.isFinite));
world.controls.update = updateControls;

world.deactivate();
assert.equal(world.controls.enabled, false);
const inactivePosition = world.position.clone();
world.update({ delta: 0.05 });
assert.deepEqual(world.position.toArray(), inactivePosition.toArray());
assert.deepEqual(surfaceRoot.position.toArray(), surfacePosition.toArray(), 'Underground play never moves the surface actor.');
world.dispose();
assert.equal(listeners.size, 0, 'Controller disposal removes its input listeners.');
assert.equal(disposedSurface, 0, 'Underground disposal preserves shared surface resources.');

// Exercise the real session routing without creating WebGL, audio, or a server.
const captions = [];
const session = new PondGameSession(null, {
  saveState: { underground: { discoveries: ['nest', 'underground.story.roots', 'invalid', 'store'] } },
  onRadioCaption: (message) => captions.push(message),
});
assert.deepEqual([...session.undergroundDiscoveries], ['nest', 'store'],
  'Saved discoveries use the same plain room identifiers as the controller.');
const surfaceCamera = new THREE.PerspectiveCamera(55, 1.5, 0.1, 700);
surfaceCamera.position.set(4, 2, 8);
const savedCameraPosition = surfaceCamera.position.clone();
const savedControlsTarget = new THREE.Vector3(3, 0.1, 4);
const sessionCalls = [];
session.app = {
  ...app,
  camera: surfaceCamera,
  controls: { enabled: true, target: savedControlsTarget.clone() },
  clearAntMovement: () => {},
  setExploreTouchMode: (value) => sessionCalls.push(['touchExplore', value]),
  setAntLocatorActive: (value) => sessionCalls.push(['locator', value]),
  setAlternateRuntime(value) { this.alternateRuntime = value; },
  setView(view) { sessionCalls.push(['view', view]); this.controls.enabled = true; },
  getAntWorldPosition: (target) => target.copy(surfaceRoot.position),
  getAntFacingDirection: (target) => target.set(0, 0, 1),
  setAntMovementAxes: () => { throw new Error('Underground input reached the surface actor.'); },
  setAntMovementKey: () => { throw new Error('Underground input reached the surface actor.'); },
  setAntRunning: () => { throw new Error('Underground run input reached the surface actor.'); },
  isAntAnimationBusy:()=>false, isAntFlightEnabled:()=>false,
};
const surfaceGame = {
  setPaused(value) { this.paused = value; },
  getSaveState: () => ({ delivered: 2 }),
};
session.game = surfaceGame;
session.objectives = { ...surfaceGame, getSaveState: () => ({ completed: [] }) };
session.climbing = {
  setPaused(value) { this.paused = value; },
  clearMovementInput: () => {},
  isClimbing: () => false,
};
session.radioAudio = { setEnabled(value) { this.enabled = value; } };
session.ambienceAudio = { setEnabled(value) { this.enabled = value; } };
session.underground = new UndergroundWorld(session.app);
await session.underground.start({ seedCount: 2 });
assert.equal(session.setUndergroundActive(true), true);
assert.equal(session.paused, false, 'The session remains playable underground.');
assert.equal(session.app.controls.enabled, false);
assert.equal(session.app.alternateRuntime, session.underground);
assert.equal(session.game.paused, true);
assert.equal(session.objectives.paused, true);
assert.equal(session.climbing.paused, true, 'Surface controllers remain suspended while inside.');
assert.equal(session.radioAudio.enabled, false);
assert.equal(session.ambienceAudio.enabled, false);
session.setMovementAxes(0.3, 0.7);
assert.equal(session.underground.inputX, 0.3);
assert.equal(session.underground.inputY, 0.7);
session.setMovementKey('forward', true);
assert.equal(session.underground.keys.has('forward'), true);
session.setAntRunning(true);
assert.equal(session.underground.running, true);
assert.equal(session.canUseBurrow(),true,'The same visible exit action is available to desktop and touch.');
session.setExploreActive(true);
assert.equal(session.canUseBurrow(),false,'Map uses Back to ant before walking to the exit.');
session.setMovementAxes(1, 1);
assert.equal(session.underground.inputX, 0);
assert.equal(session.underground.inputY, 0);
assert.equal(session.underground.exploreActive, true);
session.setExploreActive(false);
assert.equal(sessionCalls.some(([key]) => key === 'view'), false,
  'Underground Explore never invokes the surface camera presets.');
assert.deepEqual(surfaceCamera.position.toArray(), savedCameraPosition.toArray());
assert.deepEqual(session.app.controls.target.toArray(), savedControlsTarget.toArray());
const sessionSave = session.getSaveState();
assert.equal(sessionSave.ant.x, surfaceRoot.position.x);
assert.equal(sessionSave.ant.z, surfaceRoot.position.z);
assert.deepEqual(sessionSave.underground.discoveries, ['nest', 'store'],
  'Underground saves preserve the safe surface return position and discovered rooms.');
assert.equal(session.getPlayerWorldPosition(), session.underground.position);
assert.equal(session.setUndergroundActive(false), true);
assert.equal(session.underground.active, false);
assert.equal(session.app.alternateRuntime, null);
assert.equal(session.app.controls.enabled, true);
assert.equal(session.game.paused, false);
assert.equal(session.objectives.paused, false);
assert.equal(session.climbing.paused, false);
assert.equal(session.radioAudio.enabled, true);
assert.equal(session.ambienceAudio.enabled, session.soundEnabled);
assert.deepEqual(sessionCalls.filter(([key]) => key === 'view'), [['view', 'ant']]);
assert.deepEqual(surfaceRoot.position.toArray(), surfacePosition.toArray());
// Exercise main's real map synchronization and modal open/close actions.
const uiSession={
  isExploreActive:()=>mapActive, isUnderground:()=>true,
  isBirdActive:()=>false, isBirdPreparing:()=>false, canPlayBird:()=>false,
  getUndergroundMapData:()=>session.underground.getMapData(),
  setExploreActive:(active)=>{mapActive=active;}, clearMovementInput:()=>{}, focusScene:()=>{},
};
let mapActive=true;
const genericElement=()=>({hidden:false,setAttribute(){},focus(){},querySelector(){return null;},textContent:''});
const uiElements=new Proxy({}, {get:(target,key)=>target[key]??(target[key]=genericElement())});
uiElements.undergroundMap={open:false,showModal(){this.open=true;},close(){this.open=false;}};
const controlStart=mainSource.indexOf('function updateExploreControl()');
const controlEnd=mainSource.indexOf('function setChecklistCollapsed',controlStart);
const closeStart=mainSource.indexOf('function closeUndergroundMap()');
const closeEnd=mainSource.indexOf('async function toggleBird',closeStart);
const mapUi={elements:uiElements,session:uiSession,t:(key)=>key,
  document:{body:{classList:{toggle(){}}}},debugControls:{sync(){}},gameReady:true,
  renderUndergroundMap,mapViewport:{reset(){},clear(){}},requestAnimationFrame:(callback)=>callback(),clearGameInput(){},paused:false};
runInNewContext(mainSource.slice(controlStart,controlEnd)+mainSource.slice(closeStart,closeEnd)
  +'updateExploreControl();',mapUi);
assert.equal(uiElements.undergroundMap.open,true,'Underground Explore opens an actual modal map.');
assert.ok(uiElements.undergroundMapContent.innerHTML.includes('underground-map__player'));
runInNewContext('closeUndergroundMap();',mapUi);
assert.equal(mapActive,false,'Back to ant closes map state.');
assert.equal(uiElements.undergroundMap.open,false,'Back to ant also closes the native dialog.');
assert.equal(uiElements.exploreButton.textContent,'underground.map.button','Walking shows Map on the shared control.');

session.underground.dispose();
surfaceGeometry.dispose();
surfaceMaterial.dispose();
console.log('Underground layout, movement, camera, lazy lifecycle, and resource checks passed.');


// Orthographic surface pixels and SVG coordinates share corners and orientation.
const captureBounds={x:-4,z:-3,width:8,height:4};
const overhead=createSurfaceMapCamera(captureBounds);
for(const cut of [0.5,2,4]) {
  const sliced=createSurfaceMapCamera(captureBounds,cut);
  assert.ok(new THREE.Vector3(0,cut+0.1,0).project(sliced).z < -1,
    'Geometry above the cutoff is outside the capture near plane.');
  const below=new THREE.Vector3(0,cut-0.1,0).project(sliced);
  assert.ok(below.z >= -1 && below.z <= 1,'Lower scenery remains visible.');
}
for(const [x,z,screenX,screenY] of [[-4,-3,-1,1],[4,-3,1,1],[-4,1,-1,-1],[4,1,1,-1]]) {
  const projected=new THREE.Vector3(x,0,z).project(overhead);
  assert.ok(Math.abs(projected.x-screenX)<1e-8 && Math.abs(projected.y-screenY)<1e-8);
}
function surfaceCaptureFixture(failure='') {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#123456'); scene.fog=new THREE.Fog('#abcdef',1,20);
  const world=new THREE.Group(); const sky=new THREE.Group();
  const existingLight=new THREE.DirectionalLight();
  const canopy=new THREE.Mesh(); canopy.name='Instanced ash canopy';
  const ant=new THREE.Group();
  const water=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());
  water.onBeforeRender=()=>{throw new Error('Reflection must not run during capture.');};
  world.add(canopy,ant,water); scene.add(world,sky,existingLight);
  const state={target:{name:'original target'},viewport:new THREE.Vector4(1,2,300,150),
    scissor:new THREE.Vector4(3,4,200,100),scissorTest:true,color:new THREE.Color('#654321'),alpha:.4};
  const saved={...state,viewport:state.viewport.clone(),scissor:state.scissor.clone(),color:state.color.clone(),
    background:scene.background,fog:scene.fog,waterMaterial:water.material,waterHook:water.onBeforeRender};
  let disposedTarget=false;
  const renderer={xr:{enabled:true},shadowMap:{enabled:true},autoClear:false,
    getRenderTarget:()=>state.target,getActiveCubeFace:()=>2,getActiveMipmapLevel:()=>1,
    getViewport:(v)=>v.copy(state.viewport),getScissor:(v)=>v.copy(state.scissor),getScissorTest:()=>state.scissorTest,
    getClearColor:(v)=>v.copy(state.color),getClearAlpha:()=>state.alpha,
    setClearColor(color,alpha){state.color.set(color);state.alpha=alpha;},
    setRenderTarget(target){state.target=target;if(target?.isWebGLRenderTarget) target.addEventListener('dispose',()=>{disposedTarget=true;});},
    setViewport(...args){args[0]?.isVector4 ? state.viewport.copy(args[0]) : state.viewport.set(...args);},
    setScissor:(value)=>state.scissor.copy(value),setScissorTest:(value)=>{state.scissorTest=value;},clear(){},
    render(rendered,camera){
      assert.equal(rendered,scene);assert.ok(camera.isOrthographicCamera);
      assert.equal(sky.visible,false);assert.equal(canopy.visible,false);assert.equal(ant.visible,false);
      assert.equal(existingLight.visible,false);assert.equal(renderer.shadowMap.enabled,false);
      assert.notEqual(water.material,saved.waterMaterial);water.onBeforeRender();
      if(failure==='render') throw new Error('render failed');
    },
    readRenderTargetPixels(target,x,y,width,height,pixels){
      if(failure==='read') throw new Error('read failed');
      for(let row=0;row<height;row++) pixels.fill((row+1)*10,row*width*4,(row+1)*width*4);
    },
  };
  return {app:{scene,world,renderer,ant:{group:ant},activePondWater:{water}},verify(){
    assert.equal(state.target,saved.target);assert.deepEqual(state.viewport.toArray(),saved.viewport.toArray());
    assert.deepEqual(state.scissor.toArray(),saved.scissor.toArray());assert.equal(state.scissorTest,true);
    assert.equal(state.color.getHex(),saved.color.getHex());assert.equal(state.alpha,.4);
    assert.equal(renderer.xr.enabled,true);assert.equal(renderer.shadowMap.enabled,true);assert.equal(renderer.autoClear,false);
    assert.equal(scene.background,saved.background);assert.equal(scene.fog,saved.fog);
    assert.deepEqual(scene.children,[world,sky,existingLight]);
    assert.equal(sky.visible,true);assert.equal(canopy.visible,true);assert.equal(ant.visible,true);
    assert.equal(water.material,saved.waterMaterial);assert.equal(water.onBeforeRender,saved.waterHook);
    assert.equal(disposedTarget,true,'Temporary render target is released.');
    water.geometry.dispose();water.material.dispose();
  }};
}
for(const failure of ['', 'render','read','encode']) {
  const fixture=surfaceCaptureFixture(failure);
  const run=()=>captureSurfaceMap(fixture.app,captureBounds,4,()=>{
    if(failure==='encode') throw new Error('encode failed');
    return 'data:image/png;base64,surface';
  });
  if(failure) assert.throws(run,new RegExp(failure+' failed'));
  else {
    const snapshot=run();assert.deepEqual(snapshot.bounds,captureBounds);
    const imageMap=renderUndergroundMap({...mapData,surfaceMap:snapshot},(key)=>key);
    assert.ok(imageMap.includes('href="data:image/png;base64,surface"'));
    assert.ok(imageMap.includes('visibility="hidden"'),'Outlines yield to the 3D image.');
  }
  fixture.verify();
}
const fixture=surfaceCaptureFixture();
const previousDocument=globalThis.document;
let encodedRows;
globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData:(data)=>{encodedRows=data.data;}}),toDataURL:()=> 'data:image/png;base64,flipped'})};
try {
  captureSurfaceMap(fixture.app,captureBounds,4);
  assert.equal(encodedRows[0],20,'Readback is flipped so smaller world Z is at the top of SVG.');
} finally {globalThis.document=previousDocument;fixture.verify();}
assert.deepEqual(getMapBounds(mapData),getMapBounds({...mapData,position:layout.landmarks.nest}),
  'Surface capture bounds stay fixed as the ant moves within the tunnel plan.');
console.log('Surface overlay checks passed: projection, pixel orientation, failure restoration, and resource cleanup.');
