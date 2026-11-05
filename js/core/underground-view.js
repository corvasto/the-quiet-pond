import * as THREE from 'three';

// Render the same world with indoor visual conditions, then restore the surface.
export class UndergroundView {
  constructor(app) {
    this.app = app;
    const environment = app.environment ?? {};
    const objects = [environment.sky, environment.nightSky, environment.clouds,
      environment.stars, environment.sunGlare, app.weather?.rain, app.fireflies?.points,
      ...(app.weather?.impacts ?? []).map((effect) => effect.sprite),
      ...(app.moths?.moths ?? []).map((effect) => effect.sprite)];
    // Build the light list once, including lamps and actor lights.
    app.scene.traverse((object) => { if (object.isLight) objects.push(object); });
    this.hidden = [...new Set(objects.filter(Boolean))].map((object) => ({ object, visible: false }));
    this.fill = new THREE.HemisphereLight('#e8d1b5', '#765339', 1.1);
    this.key = new THREE.DirectionalLight('#efd7b7', 0.8);
    this.key.position.set(2, 4, 1);
    this.fill.visible = this.key.visible = false;
    app.scene.add(this.fill, this.key);
    this.background = new THREE.Color('#30251b');
    this.fog = new THREE.FogExp2('#30251b', 0.025);
    this.clearColor = new THREE.Color();
  }

  render() {
    const { scene, renderer, camera } = this.app;
    const background = scene.background, fog = scene.fog, exposure = renderer.toneMappingExposure;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    for (const entry of this.hidden) { entry.visible = entry.object.visible; entry.object.visible = false; }
    this.fill.visible = this.key.visible = true;
    scene.background = this.background; scene.fog = this.fog;
    renderer.toneMappingExposure = 1;
    try { renderer.render(scene, camera); }
    finally {
      for (const entry of this.hidden) entry.object.visible = entry.visible;
      this.fill.visible = this.key.visible = false;
      scene.background = background; scene.fog = fog;
      renderer.toneMappingExposure = exposure;
      renderer.setClearColor(this.clearColor, alpha);
    }
  }

  dispose() {
    this.fill.removeFromParent(); this.key.removeFromParent();
    this.fill.dispose?.(); this.key.dispose?.();
  }
}
