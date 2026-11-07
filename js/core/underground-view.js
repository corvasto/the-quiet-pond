import * as THREE from 'three';

const INDOOR_FOG_COLOR = new THREE.Color('#30251b');

// Render the same world with indoor visual conditions, then restore the surface.
export class UndergroundView {
  constructor(app) {
    this.app = app;
    const environment = app.environment ?? {};
    const objects = [environment.sunGlare, app.weather?.rain, app.fireflies?.points,
      ...(app.weather?.impacts ?? []).map((effect) => effect.sprite),
      ...(app.moths?.moths ?? []).map((effect) => effect.sprite)];
    this.hidden = [...new Set(objects.filter(Boolean))].map((object) => ({ object, visible: false, interiorOnly: false }));
    // Keep the real sky visible through the entrance, even from deeper inside.
    app.scene.traverse((object) => {
      if (object.isLight) this.hidden.push({ object, visible: false, intensity: 0, interiorOnly: true });
    });
    this.fill = new THREE.HemisphereLight('#e8d1b5', '#765339', 1.1);
    this.key = new THREE.DirectionalLight('#efd7b7', 0.8);
    this.key.position.set(2, 4, 1);
    this.fill.visible = this.key.visible = false;
    app.scene.add(this.fill, this.key);
    this.fog = new THREE.FogExp2('#30251b', 0.025);
    this.clearColor = new THREE.Color();
  }

  render(interior = 1) {
    const { scene, renderer, camera } = this.app;
    const blend = THREE.MathUtils.clamp(Number(interior), 0, 1);
    const background = scene.background, fog = scene.fog, exposure = renderer.toneMappingExposure;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    for (const entry of this.hidden) {
      entry.visible = entry.object.visible;
      if (entry.interiorOnly) {
        entry.intensity = entry.object.intensity;
        entry.object.intensity *= 1 - blend;
        entry.object.visible = entry.visible && blend < 1;
      } else entry.object.visible = false;
    }
    this.fill.visible = this.key.visible = blend > 0;
    this.fill.intensity = 1.1 * blend; this.key.intensity = 0.8 * blend;
    if (blend > 0) {
      this.fog.color.copy(fog?.color ?? this.clearColor).lerp(INDOOR_FOG_COLOR, blend);
      this.fog.density = THREE.MathUtils.lerp(fog?.density ?? 0, 0.025, blend);
      scene.fog = this.fog;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(exposure, 1, blend);
    }
    try { renderer.render(scene, camera); }
    finally {
      for (const entry of this.hidden) {
        entry.object.visible = entry.visible;
        if (entry.interiorOnly) entry.object.intensity = entry.intensity;
      }
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
