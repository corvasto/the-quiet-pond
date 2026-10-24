import * as THREE from 'three';
import { translateMessage } from '../content/messages.js';

function resolveSpeechText(message, language) {
  if (typeof message === 'string') return translateMessage(message, language);
  return message?.[language] ?? message?.en ?? '';
}

function createSpeechTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  context.font = '600 25px Georgia, serif';
  context.fillStyle = 'rgba(24, 32, 22, 0.84)';
  context.beginPath();
  context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 14);
  context.fill();
  context.fillStyle = '#fff5cf';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(text), canvas.width * 0.5, canvas.height * 0.5 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class WorldSpeech {
  constructor(app, { language = 'en', duration = 5 } = {}) {
    this.app = app;
    this.language = language === 'id' ? 'id' : 'en';
    this.duration = Math.max(0.1, Number(duration) || 5);
    this.entries = new Map();
  }

  setLanguage(language) {
    this.language = language === 'id' ? 'id' : 'en';
    this.entries.forEach((entry) => this.updateTexture(entry));
  }

  show(id, text, getPosition) {
    this.remove(id);
    const texture = createSpeechTexture(resolveSpeechText(text, this.language));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      fog: true,
    }));
    sprite.name = `${id} discovery speech`;
    sprite.scale.set(0.28, 0.04, 1);
    this.app.addWorldObject(sprite);
    this.entries.set(id, { sprite, text, getPosition, remaining: this.duration });
  }

  update(delta) {
    for (const [id, entry] of this.entries) {
      const position = entry.getPosition?.();
      if (position) entry.sprite.position.copy(position);
      entry.remaining -= Math.max(0, Number(delta) || 0);
      if (entry.remaining <= 0) this.remove(id);
    }
  }

  updateTexture(entry) {
    const material = entry.sprite.material;
    const next = createSpeechTexture(resolveSpeechText(entry.text, this.language));
    material.map?.dispose();
    material.map = next;
    material.needsUpdate = true;
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.app.removeWorldObject(entry.sprite);
    entry.sprite.material.map?.dispose();
    entry.sprite.material.dispose();
    this.entries.delete(id);
  }

  dispose() {
    [...this.entries.keys()].forEach((id) => this.remove(id));
  }
}
