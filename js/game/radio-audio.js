import * as THREE from 'three';
import { POND_GAME } from '../config/game.js';

function clamp01(value) {
  return THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
}

function isNight(hour) {
  return hour >= 18.5 || hour < 6.5;
}

export class PondRadioAudio {
  constructor(app, { onCaption = () => {}, language = 'en' } = {}) {
    this.app = app;
    this.onCaption = onCaption;
    this.config = POND_GAME.radioAudio;
    this.listener = null;
    this.radioPosition = new THREE.Vector3();
    this.antPosition = new THREE.Vector3();
    this.audioLoader = new THREE.AudioLoader();
    this.music = new Map();
    this.staticAudio = null;
    this.announcements = new Map();
    this.musicKey = null;
    this.musicPlaying = false;
    this.announcementAudio = null;
    this.unlocked = false;
    this.enabled = true;
    this.nearby = false;
    this.announcementCooldown = 0;
    this.hasIntroduced = false;
    this.loadPromise = null;
    this.musicMode = 'auto';
    this.voiceEnabled = true;
    this.debugAnnouncementIndex = 0;
    this.language = language === 'id' ? 'id' : 'en';
    this.announcementLoadId = 0;
    this.disposed = false;
  }

  start() {
    if (this.disposed || this.config?.enabled === false || !this.app?.camera) return;
    const radio = this.app.getSceneLandmarks()?.radio;
    if (!radio?.position) return;
    this.radioPosition.copy(radio.position);
    this.listener = new THREE.AudioListener();
    this.app.camera.add(this.listener);
    this.loadPromise = this.loadAudio();
  }

  async loadAudio() {
    const musicEntries = Object.entries(this.config.music ?? {});
    await Promise.all([
      ...musicEntries.map(async ([key, url]) => {
        const listener = this.listener;
        const buffer = await this.audioLoader.loadAsync(url);
        if (this.disposed || !listener || listener !== this.listener) return;
        const audio = this.createRadioAudio({
          buffer,
          refDistance: 1.4,
          maxDistance: this.config.musicDistance ?? 5.5,
          rolloffFactor: 1.2,
          loop: true,
          volume: 0,
        });
        if (audio) this.music.set(key, audio);
      }),
      this.loadStaticAudio(),
      this.loadAnnouncements(),
    ]).catch((error) => {
      console.warn('Pond radio audio could not load:', error);
    });
  }

  async loadAnnouncements() {
    const language = this.language;
    const loadId = ++this.announcementLoadId;
    const announcementEntries = Object.entries(this.config.announcements ?? {});
    const loadedAnnouncements = await Promise.all(announcementEntries.map(async ([key, entry]) => {
      const url = new URL(`../../assets/audio/${language}/${entry.file}`, import.meta.url).href;
      const buffer = await this.audioLoader.loadAsync(url);
      return [key, {
        buffer,
        text: entry.text?.[language] ?? entry.text?.en ?? '',
      }];
    }));
    if (!this.disposed && loadId === this.announcementLoadId) {
      this.announcements = new Map(loadedAnnouncements);
    }
  }

  async loadStaticAudio() {
    const config = this.config.static;
    if (config?.enabled === false || !config?.url) return;
    const listener = this.listener;
    const buffer = await this.audioLoader.loadAsync(config.url);
    if (this.disposed || !listener || listener !== this.listener) return;
    this.staticAudio = this.createRadioAudio({
      buffer,
      refDistance: 0.8,
      maxDistance: config.distance ?? 3.4,
      rolloffFactor: 1.1,
      loop: true,
      volume: 0,
    });
  }

  createRadioAudio({
    buffer,
    refDistance,
    maxDistance,
    rolloffFactor,
    loop = false,
    volume = 1,
  }) {
    if (this.disposed || !this.listener || !buffer) return null;
    const audio = new THREE.PositionalAudio(this.listener);
    audio.setRefDistance(refDistance);
    audio.setMaxDistance(maxDistance);
    audio.setRolloffFactor(rolloffFactor);
    audio.setLoop(loop);
    audio.setVolume(volume);
    audio.setBuffer(buffer);
    if (this.app?.radio?.group) {
      audio.position.set(0, 0, 0);
      this.app.radio.group.add(audio);
    } else if (this.app?.scene) {
      audio.position.copy(this.radioPosition);
      this.app.scene.add(audio);
    }
    return audio;
  }

  releaseAudio(audio) {
    if (!audio) return;
    if (audio.isPlaying) audio.stop();
    audio.removeFromParent();
    audio.disconnect();
    audio.gain?.disconnect();
  }

  unlock() {
    this.unlocked = true;
    const context = this.listener?.context;
    context?.resume?.();
    this.updateMusicPlayback();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.stopMusic();
      this.stopStatic();
      this.releaseAudio(this.announcementAudio);
      this.announcementAudio = null;
    } else {
      this.updateMusicPlayback();
    }
    return this.enabled;
  }

  setLanguage(language) {
    const nextLanguage = language === 'id' ? 'id' : 'en';
    if (nextLanguage === this.language) return;
    this.language = nextLanguage;
    this.releaseAudio(this.announcementAudio);
    this.announcementAudio = null;
    this.onCaption('', 0);
    this.announcements.clear();
    this.loadAnnouncements().catch((error) => {
      console.warn('Pond radio announcements could not load:', error);
    });
  }

  cycleMusicMode() {
    const modes = ['auto', 'daytime', 'nightRain', 'off'];
    const index = modes.indexOf(this.musicMode);
    this.musicMode = modes[(index + 1) % modes.length];
    this.updateMusicPlayback();
    return this.musicMode;
  }

  playDebugAnnouncement() {
    if (!this.listener) return null;
    this.unlock();
    const keys = Object.keys(this.config.announcements ?? {});
    if (!keys.length) return null;
    const key = keys[this.debugAnnouncementIndex % keys.length];
    this.debugAnnouncementIndex += 1;
    if (this.announcements.has(key)) this.playAnnouncement(key);
    else this.loadPromise?.then(() => this.playAnnouncement(key));
    return key;
  }

  update({ delta = 0, hour = 12, raining = false, antPosition = null } = {}) {
    if (!this.listener || !antPosition) return;
    this.antPosition.copy(antPosition);
    const distance = Math.hypot(
      this.antPosition.x - this.radioPosition.x,
      this.antPosition.z - this.radioPosition.z,
    );
    this.nearby = distance <= (this.config.musicDistance ?? 5.5);
    const proximity = 1 - clamp01(distance / (this.config.musicDistance ?? 5.5));
    const automaticMusicKey = raining || isNight(hour) ? 'nightRain' : 'daytime';
    const musicKey = this.musicMode === 'auto'
      ? automaticMusicKey
      : this.musicMode === 'off'
        ? null
        : this.musicMode;
    const activeMusic = this.music.get(musicKey);
    this.musicKey = musicKey;
    const fadeSeconds = Math.max(0.1, Number(this.config.crossfadeSeconds) || 2.5);
    const fadeFactor = 1 - Math.exp(-Math.max(0.016, Number(delta) || 0.016) / fadeSeconds);
    this.music.forEach((audio, key) => {
      const target = key === musicKey && this.nearby
        ? proximity * (this.config.musicVolume ?? 0.62)
        : 0;
      const nextVolume = THREE.MathUtils.lerp(audio.getVolume(), target, fadeFactor);
      audio.setVolume(nextVolume);
      if (key !== musicKey && nextVolume < 0.003 && audio.isPlaying) audio.stop();
    });
    if (this.staticAudio) {
      const staticConfig = this.config.static ?? {};
      const staticDistance = Number(staticConfig.distance) || 3.4;
      const staticProximity = 1 - clamp01(distance / staticDistance);
      const staticTarget = this.nearby
        ? staticProximity * (Number(staticConfig.volume) || 0.055)
        : 0;
      const staticVolume = THREE.MathUtils.lerp(
        this.staticAudio.getVolume(),
        staticTarget,
        fadeFactor,
      );
      this.staticAudio.setVolume(staticVolume);
      if (this.unlocked && staticTarget > 0.001 && !this.staticAudio.isPlaying) {
        this.staticAudio.play();
      } else if (staticTarget <= 0.001 && staticVolume < 0.003 && this.staticAudio.isPlaying) {
        this.staticAudio.stop();
      }
    }
    this.updateMusicPlayback();

    this.announcementCooldown = Math.max(0, this.announcementCooldown - delta);
    const announcementDistance = this.config.announcementDistance ?? 2.8;
    if (
      distance <= announcementDistance
      && this.announcementCooldown <= 0
      && this.unlocked
      && this.voiceEnabled
    ) {
      const key = this.selectAnnouncement(hour, raining);
      if (key) this.playAnnouncement(key);
    }
    if (activeMusic && this.nearby && !this.unlocked) activeMusic.setVolume(0);
  }

  selectAnnouncement(hour, raining) {
    if (!this.hasIntroduced) {
      this.hasIntroduced = true;
      return 'station';
    }
    if (raining) return Math.random() < 0.5 ? 'rain' : 'rainVariant';
    if (isNight(hour)) return 'dusk';
    return Math.random() < 0.5 ? 'morning' : 'seed';
  }

  playAnnouncement(key) {
    const entry = this.announcements.get(key);
    if (!entry || !this.listener || !this.unlocked || this.disposed) return;
    this.releaseAudio(this.announcementAudio);
    const audio = this.createRadioAudio({
      buffer: entry.buffer,
      refDistance: 0.9,
      maxDistance: this.config.announcementDistance ?? 2.8,
      rolloffFactor: 1.1,
      volume: this.config.announcementVolume ?? 0.88,
    });
    if (!audio) return;
    audio.play();
    this.announcementAudio = audio;
    this.announcementCooldown = this.config.announcementCooldownSeconds ?? 70;
    this.onCaption(entry.text, this.config.captionSeconds ?? 5);
  }

  updateMusicPlayback() {
    if (!this.enabled || !this.unlocked) return;
    const audio = this.music.get(this.musicKey);
    if (!audio?.buffer || !this.nearby) {
      this.stopMusic();
      return;
    }
    if (this.musicPlaying && audio.isPlaying) return;
    if (!audio.isPlaying) audio.play();
    this.musicPlaying = true;
  }

  stopMusic() {
    this.music.forEach((audio) => {
      if (audio.isPlaying) audio.stop();
      audio.setVolume(0);
    });
    this.musicPlaying = false;
  }

  stopStatic() {
    if (!this.staticAudio) return;
    if (this.staticAudio.isPlaying) this.staticAudio.stop();
    this.staticAudio.setVolume(0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMusic();
    this.stopStatic();
    this.music.forEach((audio) => this.releaseAudio(audio));
    this.releaseAudio(this.staticAudio);
    this.releaseAudio(this.announcementAudio);
    this.listener?.removeFromParent();
    this.listener?.gain?.disconnect();
    this.music.clear();
    this.announcements.clear();
    this.announcementLoadId += 1;
    this.staticAudio = null;
    this.announcementAudio = null;
    this.loadPromise = null;
    this.listener = null;
  }
}
