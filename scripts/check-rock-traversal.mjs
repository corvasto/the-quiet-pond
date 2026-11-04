import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from '../vendor/three/build/three.module.js';
async function importRuntime(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  const source = (await fs.readFile(url, 'utf8')).replace(
    /from (['"])([^'"]+)\1/g,
    (match, quote, specifier) => {
      const resolved = specifier === 'three'
        ? new URL('../vendor/three/build/three.module.js', import.meta.url)
        : new URL(specifier, url);
      return `from ${quote}${resolved.href}${quote}`;
    },
  );
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const { AntClimbing } = await importRuntime('../js/game/ant-climbing.js');
const { installPondWorldQueryMethods } = await importRuntime('../js/core/app-world-query.js');
class QueryHarness {}
installPondWorldQueryMethods(QueryHarness);
const app = new QueryHarness();
Object.assign(app, {
  surfaceRaycaster: new THREE.Raycaster(), surfaceRayOrigin: new THREE.Vector3(),
  surfaceRayDirection: new THREE.Vector3(), surfaceRayFaceNormal: new THREE.Vector3(),
  surfaceRayNormalMatrix: new THREE.Matrix3(), surfaceRayInstanceMatrix: new THREE.Matrix4(),
  getAntGroundPosition: () => null,
});

const rocksMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 1), new THREE.MeshBasicMaterial(), 3);
for (const [index,x] of [0,0.9,2.5].entries()) rocksMesh.setMatrixAt(index,new THREE.Matrix4().makeTranslation(x,0.2,0));
rocksMesh.updateWorldMatrix(true,true);
const rocks=[0,0.9,2.5].map((x,index)=>({
  source:'ground',rockIndex:index,surfaceObject:rocksMesh,
  position:new THREE.Vector3(x,0.4,0),basePosition:new THREE.Vector3(x,0,0),usableRadius:0.5,
  footprint:{x,z:0,radiusX:0.5,radiusZ:0.5,cosine:1,sine:0},
}));
const climb=new AntClimbing(app);
climb.landmarks={rocks};
climb.buildRockSurfaceGroups();
assert.equal(climb.rockSurfaceGroups.get(rocks[0]).length,2,'Touching rocks must share climb surfaces.');
assert.equal(climb.rockSurfaceGroups.get(rocks[2]).length,1,'A separate rock must not join the connected group.');
climb.route={id:'rock-ground-0',kind:'rock',rock:rocks[0],center:rocks[0].basePosition,
  entryRadius:0.7,surfaces:climb.rockSurfaceGroups.get(rocks[0]),allowedRocks:[rocks[0]]};
climb.surfacePoint.set(0.495,0.4,0);
climb.surfaceNormal.set(0,1,0);
const direction=new THREE.Vector3(1,0,0);
const next=climb.findAdjacentContact(new THREE.Vector3(0.505,0.4,0),direction,0.01);
assert.ok(next && Math.abs(next.position.x-0.505)<1e-6,'The ant must cross a touching rock seam.');
const selected=app.raycastSurface(rocksMesh,new THREE.Vector3(0.9,1,0),new THREE.Vector3(0,-1,0),{
  instanceId:1,targetPosition:new THREE.Vector3(),targetNormal:new THREE.Vector3(),
});
assert.equal(selected.instanceId,1);
assert.equal(selected.object,rocksMesh,'Per-instance queries preserve source identity.');
assert.ok(Math.abs(selected.position.y-0.4)<1e-6 && selected.normal.y>0.99);
assert.equal(climb.isInsideNeighborRock(new THREE.Vector3(0.45,0.2,0),climb.route,{object:rocksMesh,instanceId:0}),true,
  'Connected rocks must still block surfaces hidden inside a neighbor.');
climb.surfacePoint.set(1.395,0.4,0);
const edge=climb.findAdjacentContact(new THREE.Vector3(1.405,0.4,0),direction,0.01);
assert.ok(!edge || edge.position.x <= 1.40001,
  'Climbing may wrap down an edge but must not jump across an empty gap.');
const radio=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.2));
radio.position.set(0,0.6,0);
climb.landmarks.radio={surfaceObject:radio,bounds:new THREE.Box3().setFromObject(radio),
  size:new THREE.Vector3(0.2,0.2,0.2),supportRock:rocks[0]};
const radioRoute=climb.getRouteCandidates(new THREE.Vector3(0,0.4,0)).find((route)=>route.id==='radio');
assert.ok(radioRoute && radioRoute.surfaces.filter((surface)=>surface.role==='support').length===2,
  'The radio route must retain the connected support rocks.');
const originalRaycast=rocksMesh.raycast;
rocksMesh.raycast=()=>{throw new Error('A selected-instance query must not scan all instances.');};
assert.ok(app.raycastSurface(rocksMesh,new THREE.Vector3(0.9,1,0),new THREE.Vector3(0,-1,0),{
  instanceId:1,targetPosition:new THREE.Vector3(),targetNormal:new THREE.Vector3(),
}));
rocksMesh.raycast=originalRaycast;
console.log('Rock traversal checks passed: connected surfaces, buried-contact rejection, separate gaps, and instance identity.');
