import { captureSurfaceMap, createSurfaceMapCamera } from '../js/core/surface-map.js';
import { getMapBounds } from '../js/utils/map-bounds.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createUndergroundLayout } from '../js/content/underground-layout.js';
import { createUnderground } from '../js/generators/underground.js';
import { renderUndergroundMap, createMapViewport, setMapLabelsVisible } from '../js/ui/underground-map.js';

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
const corner = layout.pointAt(1, -1);
assert.equal(layout.isWalkable(corner.x + layout.cellSize * 0.49,
  corner.z - layout.cellSize * 0.49, 0.15), false, 'A circle cannot squeeze through a solid corner.');

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
const openEdges = [...edges].filter(([, count]) => count !== 2);
assert.ok(openEdges.length > 0, 'The entry has an opening');
for (const [edge, count] of openEdges) {
  assert.equal(count, 1);
  for (const point of edge.split('|')) {
    const [x, , z] = point.split(',').map((v) => Number(v) / 10000);
    assert.ok(Math.abs(z - (layout.spawn.z - layout.cellSize * 1.5)) < 0.0002);
    assert.ok(Math.abs(x - layout.spawn.x) <= layout.cellSize / 2 + 0.0002,
      'Every unpaired edge belongs to the authored entry, never a wall seam');
  }
}
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

const mapData = { layout, position: layout.spawn, heading: 0, pond: [], pondCenter: null };
const labelClasses = new Set();
const labelContainer = {classList:{toggle(name,hidden){if(hidden)labelClasses.add(name);else labelClasses.delete(name);}}};
setMapLabelsVisible(labelContainer,false);
assert.ok(labelClasses.has('underground-map__hide-labels'));
const markup = renderUndergroundMap(mapData,(key)=>key);
assert.ok(markup.includes('underground-map__player'));
assert.ok(markup.includes('underground-map__entrance'));

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
