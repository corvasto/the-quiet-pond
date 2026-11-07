import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UndergroundCompanions } from '../js/game/underground-companions.js';
import { createUndergroundLayout } from '../js/content/underground-layout.js';
import { UNDERGROUND_CONFIG } from '../js/config/underground.js';

const layout = createUndergroundLayout(), world = new THREE.Group(), actor = new THREE.Group();
const geometry = new THREE.BoxGeometry(0.02, 0.02, 0.02), material = new THREE.MeshStandardMaterial();
actor.add(new THREE.Mesh(geometry, material), new THREE.PointLight());
let disposals = 0, listener;
geometry.addEventListener('dispose', () => disposals++); material.addEventListener('dispose', () => disposals++);
const session = { paused: false, exploreActive: false, isBelowGround: () => true,
  getBurrowLevel: () => ({ layout }), app: {
    ant: { group: actor, animations: [new THREE.AnimationClip('walk', 4, [])] },
    addWorldObject: (object) => world.add(object), removeWorldObject: (object) => object.removeFromParent(),
    onFrame(callback) { listener = callback; return () => { listener = null; }; },
  } };
const companions = new UndergroundCompanions(session);
assert.equal(companions.ants.length, 3);
assert.equal(session.app.undergroundAnts.length, 3);
for (const ant of companions.ants) ant.group.traverse((object) => assert.ok(!object.isLight, 'Clones cannot add lights'));
for (let frame = 0; frame < 1800; frame++) {
  listener({ delta: 1 / 30 });
  for (const ant of companions.ants) assert.ok(layout.isWalkable(ant.group.position.x, ant.group.position.z, UNDERGROUND_CONFIG.antRadius));
}
const positions = companions.ants.map((ant) => ant.group.position.clone());
session.paused = true;
listener({ delta: 1 });
for (let i = 0; i < 3; i++) assert.ok(companions.ants[i].group.position.equals(positions[i]));
companions.dispose();
assert.equal(listener, null); assert.equal(world.children.length, 0);
assert.equal(disposals, 0, 'Companion cleanup preserves the shared ant model resources');
assert.equal(session.app.undergroundAnts.length, 0);
console.log('Underground companion checks passed: three ants, floor-bound roaming, pause, light isolation, and shared-resource cleanup.');
