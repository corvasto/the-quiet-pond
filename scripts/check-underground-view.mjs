import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UndergroundView } from '../js/core/underground-view.js';

for (const failure of [false, true]) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#abcdef');
  scene.fog = new THREE.FogExp2('#abcdef', 0.01);
  const sky = new THREE.Group(), glare = new THREE.Group(), rain = new THREE.Group(), splash = new THREE.Group();
  const sun = new THREE.DirectionalLight(), lamp = new THREE.PointLight();
  glare.visible = false;
  scene.add(sky, glare, rain, splash, sun, lamp);
  const color = new THREE.Color('#123456');
  const renderer = { toneMappingExposure: 3.2,
    getClearAlpha: () => 0.8, getClearColor: (target) => target.copy(color),
    setClearColor(value, alpha) { color.copy(value); assert.equal(alpha, 0.8); },
    render() {
      for (const object of [sky, glare, rain, splash, sun, lamp]) assert.equal(object.visible, false);
      assert.equal(this.toneMappingExposure, 1);
      assert.ok(view.fill.visible && view.key.visible);
      assert.notEqual(scene.fog, originalFog);
      if (failure) throw new Error('render failed');
    },
  };
  const originalFog = scene.fog, background = scene.background;
  const view = new UndergroundView({ scene, camera: new THREE.PerspectiveCamera(), renderer,
    environment: { sky, sunGlare: glare }, weather: { rain, impacts: [{ sprite: splash }] } });
  if (failure) assert.throws(() => view.render(), /render failed/);
  else view.render();
  for (const object of [sky, rain, splash, sun, lamp]) assert.ok(object.visible);
  assert.equal(glare.visible, false);
  assert.equal(renderer.toneMappingExposure, 3.2);
  assert.equal(scene.fog, originalFog); assert.equal(scene.background, background);
  assert.ok(!view.fill.visible && !view.key.visible);
  view.dispose(); assert.equal(scene.children.length, 6);
}
console.log('Underground view checks passed: rain, splashes, glare and surface lighting hidden; stable exposure; surface restoration and disposal.');
