import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UndergroundView } from '../js/core/underground-view.js';

for (const interior of [0, 0.25, 0.5, 0.75, 1]) for (const failure of [false, true]) {
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
      for (const object of [glare, rain, splash]) assert.equal(object.visible, false);
      assert.ok(sky.visible, 'Visible sky through the entrance never turns black');
      assert.equal(scene.background, background);
      for (const object of [sun, lamp]) {
        assert.equal(object.visible, interior < 1);
        assert.equal(object.intensity, 1 - interior);
      }
      assert.ok(Math.abs(this.toneMappingExposure - (3.2 + (1 - 3.2) * interior)) < 1e-8);
      assert.equal(view.fill.visible && view.key.visible, interior > 0);
      assert.equal(view.fill.intensity, 1.1 * interior);
      assert.equal(scene.fog === originalFog, interior === 0);
      if (interior > 0) assert.ok(Math.abs(scene.fog.density - (0.01 + 0.015 * interior)) < 1e-8);
      if (failure) throw new Error('render failed');
    },
  };
  const originalFog = scene.fog, background = scene.background;
  const view = new UndergroundView({ scene, camera: new THREE.PerspectiveCamera(), renderer,
    environment: { sky, sunGlare: glare }, weather: { rain, impacts: [{ sprite: splash }] } });
  if (failure) assert.throws(() => view.render(interior), /render failed/);
  else view.render(interior);
  for (const object of [sky, rain, splash, sun, lamp]) assert.ok(object.visible);
  assert.equal(glare.visible, false);
  assert.equal(renderer.toneMappingExposure, 3.2);
  assert.equal(sun.intensity, 1); assert.equal(lamp.intensity, 1);
  assert.equal(scene.fog, originalFog); assert.equal(scene.background, background);
  assert.ok(!view.fill.visible && !view.key.visible);
  view.dispose(); assert.equal(scene.children.length, 6);
}
console.log('Underground view checks passed: rain, splashes, glare and surface lighting hidden; stable exposure; surface restoration and disposal.');
