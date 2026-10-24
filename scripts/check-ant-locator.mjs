import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three/build/three.module.js';
import { ANT_LOCATOR } from '../js/config/scene.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locatorPath = path.join(projectRoot, 'js/core/ant-locator.js');
const localThreeUrl = pathToFileURL(path.join(projectRoot, 'vendor/three/build/three.module.js')).href;
const locatorSource = fs.readFileSync(locatorPath, 'utf8').replace(
  "from 'three'",
  `from '${localThreeUrl}'`,
);
const locatorModuleUrl = `data:text/javascript;base64,${Buffer.from(locatorSource).toString('base64')}`;
const { AntLocator } = await import(locatorModuleUrl);

const scene = new THREE.Scene();
const locator = new AntLocator(scene, ANT_LOCATOR);
const position = new THREE.Vector3(3.5, 1.2, -4.25);

assert.equal(locator.group.visible, false, 'Locator must start hidden.');
assert.ok(scene.children.includes(locator.group), 'Locator must attach to the scene.');
assert.equal(locator.markerSphere.geometry.type, 'SphereGeometry', 'Locator marker must be a sphere.');

locator.setActive(true);
locator.update(position, 0);
assert.equal(locator.group.visible, true, 'Active locator must be visible when the ant exists.');
assert.ok(locator.group.position.equals(position), 'Locator must follow the ant world position.');

const initialOuterOpacity = locator.outerMaterial.opacity;
locator.update(position, Math.PI * 0.5 / ANT_LOCATOR.pulseSpeed);
assert.ok(locator.outerMaterial.opacity > initialOuterOpacity, 'Locator must pulse over time.');

locator.update(null, 1);
assert.equal(locator.group.visible, false, 'Locator must hide when the ant is unavailable.');
locator.update(position, 2);
assert.equal(locator.group.visible, true, 'Locator must recover when the ant returns.');

locator.setActive(false);
assert.equal(locator.group.visible, false, 'Locator must hide outside Explore View.');

let disposedGeometries = 0;
let disposedMaterials = 0;
for (const mesh of [locator.outerBeam, locator.coreBeam, locator.markerSphere]) {
  mesh.geometry.addEventListener('dispose', () => { disposedGeometries += 1; });
  mesh.material.addEventListener('dispose', () => { disposedMaterials += 1; });
}
locator.dispose();
assert.ok(!scene.children.includes(locator.group), 'Disposed locator must detach from the scene.');
assert.equal(disposedGeometries, 3, 'Locator must dispose every geometry.');
assert.equal(disposedMaterials, 3, 'Locator must dispose every material.');

console.log('Ant locator checks passed: visibility, tracking, pulse, recovery, Explore toggle, and disposal.');
