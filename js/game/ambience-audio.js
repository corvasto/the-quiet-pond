import * as THREE from 'three';
import { POND_GAME } from '../config/game.js';
import { getNightAmount } from '../utils/time-of-day.js';

export class AmbienceAudio {
  constructor(app, listener) {
    this.app = app;
    this.listener = listener;
    this.tracks = new Map();
    this.audioLoader = new THREE.AudioLoader();
    this.unlocked = false;
    this.enabled = true;
    this.disposed = false;
    this.hour = 12;
    this.raining = false;
  }

  async start() {
    if (this.disposed || !this.listener) return;
    const listener = this.listener;
    const entries = Object.entries(POND_GAME.ambience?.tracks ?? {});
    await Promise.all(entries.map(async ([key, config]) => {
      try {
        const buffer = await this.audioLoader.loadAsync(config.url);
        if (this.disposed || listener !== this.listener) return;
        const audio = new THREE.Audio(listener);
        audio.setBuffer(buffer);
        audio.setLoop(true);
        audio.setVolume(0);
        this.app.scene.add(audio);
        this.tracks.set(key, { audio, config });
      } catch (error) {
        console.warn(`Ambient track could not load (${key}):`, error);
      }
    }));
    this.update(0, this.hour, this.raining);
  }

  unlock() {
    this.unlocked = true;
    this.listener?.context?.resume?.();
    this.update(0, this.hour, this.raining);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.tracks.forEach(({ audio }) => {
        audio.setVolume(0);
        if (audio.isPlaying) audio.stop();
      });
    }
    return this.enabled;
  }

  update(delta, hour, raining) {
    this.hour = Number(hour);
    this.raining = Boolean(raining);
    this.tracks.forEach(({ audio, config }) => {
      const conditionAmount = config.condition === 'rain'
        ? Number(this.raining)
        : config.condition === 'night'
          ? getNightAmount(this.hour)
          : config.condition === 'day'
            ? 1 - getNightAmount(this.hour)
            : 1;
      const target = this.enabled
        ? conditionAmount * THREE.MathUtils.clamp(Number(config.volume) || 0, 0, 1)
        : 0;
      const fadeSeconds = Math.max(0.1, Number(config.fadeSeconds) || 3);
      const fade = 1 - Math.exp(-Math.max(0.016, Number(delta) || 0.016) / fadeSeconds);
      const volume = THREE.MathUtils.lerp(audio.getVolume(), target, fade);
      audio.setVolume(volume);
      if (this.unlocked && this.enabled && target > 0.001 && !audio.isPlaying) audio.play();
      if ((!this.enabled || target <= 0.001) && volume < 0.003 && audio.isPlaying) audio.stop();
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tracks.forEach(({ audio }) => {
      if (audio.isPlaying) audio.stop();
      audio.removeFromParent();
      audio.disconnect();
      audio.gain?.disconnect();
    });
    this.tracks.clear();
    this.listener = null;
  }
}
