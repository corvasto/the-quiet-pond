import * as THREE from 'three';
import { getNightAmount } from '../utils/time-of-day.js';

function createFireflyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255, 255, 208, 1)');
  glow.addColorStop(0.18, 'rgba(238, 255, 133, 0.95)');
  glow.addColorStop(0.52, 'rgba(186, 230, 84, 0.22)');
  glow.addColorStop(1, 'rgba(186, 230, 84, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Fireflies {
  constructor(scene, count = 36) {
    this.positions = new Float32Array(count * 3);
    this.anchors = Array.from({ length: count }, (_, index) => {
      const angle = index * 2.399963229728653;
      const radius = 2.8 + (index % 9) * 0.56;
      return {
        x: Math.cos(angle) * radius + (index % 3 - 1) * 1.8,
        y: 0.8 + (index % 7) * 0.22,
        z: Math.sin(angle) * radius - 1.8 + (index % 4 - 1.5) * 1.2,
        phase: index * 1.73,
      };
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.texture = createFireflyTexture();
    this.material = new THREE.PointsMaterial({
      map: this.texture, color: '#f2ff9c', size: 0.16, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'Dusk fireflies';
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(elapsed, hour) {
    const duskAmount = getNightAmount(hour, 18.1, 20.1);
    this.points.visible = duskAmount > 0.01;
    if (!this.points.visible) return;
    this.material.opacity = duskAmount * 0.92;
    this.anchors.forEach((anchor, index) => {
      const offset = index * 3;
      const phase = elapsed * (0.48 + (index % 5) * 0.035) + anchor.phase;
      this.positions[offset] = anchor.x + Math.sin(phase) * 0.32;
      this.positions[offset + 1] = anchor.y + Math.sin(phase * 1.7) * 0.16;
      this.positions[offset + 2] = anchor.z + Math.cos(phase * 0.82) * 0.28;
    });
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
