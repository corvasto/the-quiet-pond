import * as THREE from 'three';
import { PERFORMANCE } from '../config/index.js';

function createImpactTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(235, 248, 255, 0.95)');
  gradient.addColorStop(0.28, 'rgba(185, 220, 238, 0.5)');
  gradient.addColorStop(1, 'rgba(185, 220, 238, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class RainWeather {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.enabled = false;
    this.intensity = 0.7;
    this.amount = 0;
    this.targetAmount = 0;
    this.impactCooldown = 0;
    this.dropCount = quality === 'high'
      ? PERFORMANCE.rainDropCount
      : Math.min(PERFORMANCE.rainDropCount, 620);
    this.dropPositions = new Float32Array(this.dropCount * 6);
    this.dropVelocities = new Float32Array(this.dropCount);
    this.dropSeeds = new Float32Array(this.dropCount * 2);
    this.dropGeometry = new THREE.BufferGeometry();
    this.dropGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.dropPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.rain = new THREE.LineSegments(
      this.dropGeometry,
      new THREE.LineBasicMaterial({
        color: '#bfd6e4',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.rain.name = 'Storm rain curtain';
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.impactTexture = createImpactTexture();
    this.impacts = Array.from({ length: PERFORMANCE.rainImpactCount }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.impactTexture,
        color: '#cdeafa',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      sprite.visible = false;
      sprite.renderOrder = 3;
      scene.add(sprite);
      return { sprite, age: 1, duration: 0.22, baseSize: 0.1 };
    });
    this.nextImpact = 0;

    for (let index = 0; index < this.dropCount; index += 1) this.resetDrop(index, true);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.targetAmount = this.enabled ? this.intensity : 0;
  }

  setIntensity(value) {
    this.intensity = THREE.MathUtils.clamp(Number(value), 0.15, 1);
    if (this.enabled) this.targetAmount = this.intensity;
  }

  setQuality(quality) {
    // Drop geometry is intentionally fixed for a toggle session. Quality changes recreate the world,
    // while this keeps a live storm transition from allocating a new particle system.
    this.quality = quality;
  }

  resetDrop(index, initial = false) {
    const offset = index * 6;
    const seedOffset = index * 2;
    const spread = 17;
    const randomX = Math.random() * 2 - 1;
    const randomZ = Math.random() * 2 - 1;
    this.dropPositions[offset] = randomX * spread;
    this.dropPositions[offset + 1] = initial ? Math.random() * 22 - 8 : 12 + Math.random() * 8;
    this.dropPositions[offset + 2] = randomZ * spread;
    this.dropPositions[offset + 3] = this.dropPositions[offset] + 0.035;
    this.dropPositions[offset + 4] = this.dropPositions[offset + 1] - 0.48;
    this.dropPositions[offset + 5] = this.dropPositions[offset + 2] - 0.018;
    this.dropVelocities[index] = 14 + Math.random() * 10;
    this.dropSeeds[seedOffset] = Math.random() * Math.PI * 2;
    this.dropSeeds[seedOffset + 1] = Math.random() * 0.8 + 0.2;
  }

  createImpact(x, y, z, amount, isWater) {
    const effect = this.impacts[this.nextImpact];
    this.nextImpact = (this.nextImpact + 1) % this.impacts.length;
    effect.age = 0;
    effect.duration = THREE.MathUtils.lerp(0.14, 0.31, amount);
    effect.baseSize = THREE.MathUtils.lerp(0.06, 0.17, amount) * (isWater ? 1.7 : 1);
    effect.sprite.position.set(x, y + (isWater ? 0.018 : 0.028), z);
    effect.sprite.visible = true;
  }

  updateImpacts(delta) {
    this.impacts.forEach((effect) => {
      if (!effect.sprite.visible) return;
      effect.age += delta;
      const progress = effect.age / effect.duration;
      if (progress >= 1) {
        effect.sprite.visible = false;
        return;
      }
      const size = THREE.MathUtils.lerp(effect.baseSize, effect.baseSize * 3.8, progress);
      effect.sprite.scale.set(size, size * 0.42, 1);
      effect.sprite.material.opacity = Math.pow(1 - progress, 1.8) * 0.72;
    });
  }

  update(delta, camera, windStrength, sampleImpact) {
    const safeDelta = Math.min(delta, 0.05);
    const fadeDuration = this.targetAmount > this.amount ? 7.5 : 4.5;
    const transition = 1 - Math.exp(-safeDelta * 4 / fadeDuration);
    this.amount = THREE.MathUtils.lerp(this.amount, this.targetAmount, transition);
    if (this.amount < 0.002 && this.targetAmount === 0) this.amount = 0;
    this.rain.visible = this.amount > 0.002;
    this.rain.material.opacity = this.amount * 0.72;
    this.rain.position.set(camera.position.x, camera.position.y, camera.position.z);

    const windX = THREE.MathUtils.lerp(-0.45, -2.3, windStrength);
    const windZ = THREE.MathUtils.lerp(0.16, 0.92, windStrength);
    this.impactCooldown = Math.max(0, this.impactCooldown - safeDelta);
    for (let index = 0; index < this.dropCount; index += 1) {
      const offset = index * 6;
      const seedOffset = index * 2;
      this.dropPositions[offset] += windX * safeDelta;
      this.dropPositions[offset + 2] += windZ * safeDelta;
      this.dropPositions[offset + 1] -= this.dropVelocities[index] * safeDelta;
      this.dropPositions[offset + 3] = this.dropPositions[offset] - windX * 0.022;
      this.dropPositions[offset + 4] = this.dropPositions[offset + 1] - 0.48;
      this.dropPositions[offset + 5] = this.dropPositions[offset + 2] - windZ * 0.022;
      if (this.dropPositions[offset + 1] > -11) continue;

      if (this.amount > 0.03 && this.impactCooldown === 0) {
        const worldX = this.rain.position.x + this.dropPositions[offset];
        const worldZ = this.rain.position.z + this.dropPositions[offset + 2];
        const impact = sampleImpact(worldX, worldZ, this.amount);
        if (impact) {
          this.createImpact(worldX, impact.y, worldZ, this.amount, impact.isWater);
        this.impactCooldown = PERFORMANCE.rainImpactIntervalScale
          / THREE.MathUtils.lerp(5, 21, this.amount);
        }
      }
      this.resetDrop(index);
      this.dropPositions[offset] += Math.sin(this.dropSeeds[seedOffset]) * 2;
      this.dropPositions[offset + 2] += Math.cos(this.dropSeeds[seedOffset + 1]) * 2;
      this.dropPositions[offset + 3] = this.dropPositions[offset] + 0.035;
      this.dropPositions[offset + 5] = this.dropPositions[offset + 2] - 0.018;
    }
    this.dropGeometry.attributes.position.needsUpdate = true;
    this.updateImpacts(safeDelta);
  }

  dispose() {
    this.rain.removeFromParent();
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    this.impacts.forEach(({ sprite }) => {
      sprite.removeFromParent();
      sprite.material.dispose();
    });
    this.impactTexture.dispose();
  }
}
