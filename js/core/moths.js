import * as THREE from 'three';
import { getNightAmount } from '../utils/time-of-day.js';

function createMothTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.translate(32, 32);
  context.fillStyle = 'rgba(239, 224, 178, 0.9)';
  context.beginPath();
  context.ellipse(-11, -4, 15, 8, -0.45, 0, Math.PI * 2);
  context.ellipse(11, -4, 15, 8, 0.45, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#6a5840';
  context.fillRect(-1.5, -11, 3, 22);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class LampMoths {
  constructor(scene, count = 11) {
    this.texture = createMothTexture();
    this.anchor = new THREE.Vector3();
    this.moths = Array.from({ length: count }, (_, index) => {
      const material = new THREE.SpriteMaterial({
        map: this.texture,
        color: '#fff0bd',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = `Lamp moth ${index + 1}`;
      scene.add(sprite);
      return {
        sprite,
        angle: index * 2.399963229728653,
        radius: 0.2 + (index % 5) * 0.09,
        height: 0.42 + (index % 4) * 0.13,
        phase: index * 1.67,
      };
    });
  }

  update(elapsed, hour, lampPosition) {
    const nightAmount = getNightAmount(hour, 19.75, 20.2);
    const visible = nightAmount > 0.01 && Boolean(lampPosition);
    if (!visible) {
      this.moths.forEach(({ sprite }) => { sprite.visible = false; });
      return;
    }
    this.anchor.copy(lampPosition);
    this.moths.forEach((moth, index) => {
      const flutter = elapsed * (1.5 + (index % 3) * 0.22) + moth.phase;
      const orbit = moth.angle + elapsed * (0.55 + (index % 4) * 0.07) + Math.sin(flutter) * 0.48;
      const radius = moth.radius + Math.sin(flutter * 0.7) * 0.08;
      moth.sprite.visible = true;
      moth.sprite.position.set(
        this.anchor.x + Math.cos(orbit) * radius,
        this.anchor.y + moth.height + Math.sin(flutter * 1.8) * 0.12,
        this.anchor.z + Math.sin(orbit) * radius,
      );
      const size = 0.075 + (0.5 + 0.5 * Math.sin(flutter * 6.2)) * 0.035;
      moth.sprite.scale.set(size * (1.1 + Math.sin(flutter * 5.1) * 0.38), size, 1);
      moth.sprite.material.opacity = nightAmount * (0.62 + (index % 3) * 0.1);
    });
  }

  dispose() {
    this.moths.forEach(({ sprite }) => {
      sprite.removeFromParent();
      sprite.material.dispose();
    });
    this.texture.dispose();
  }
}
