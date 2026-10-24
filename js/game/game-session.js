import * as THREE from 'three';
import { translateMessage } from '../content/messages.js';
import { PondApp } from '../core/app.js';
import { AntClimbing } from './ant-climbing.js';
import { POND_GAME } from '../config/game.js';
import { DEFAULTS } from '../config/index.js';
import { PondGameObjectives } from './game-objectives.js';
import { ObjectiveChime } from './objective-chime.js';
import { PondRadioAudio } from './radio-audio.js';
import { SeedToBurrowGame } from './seed-to-burrow.js';

export class PondGameSession {
  constructor(container, {
    onStateChange = () => {},
    onPromptChange = () => {},
    onRadioCaption = () => {},
    onTimeChange = () => {},
    language = 'en',
    season = DEFAULTS.season,
    soundEnabled = true,
    musicVolume = POND_GAME.radioAudio.musicVolume,
    saveState = null,
  } = {}) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.onPromptChange = onPromptChange;
    this.onRadioCaption = onRadioCaption;
    this.onTimeChange = onTimeChange;
    this.language = language === 'id' ? 'id' : 'en';
    this.season = season;
    this.soundEnabled = Boolean(soundEnabled);
    this.musicVolume = THREE.MathUtils.clamp(Number(musicVolume) || 0, 0, 1);
    this.app = null;
    this.game = null;
    this.climbing = null;
    this.loopPrompt = '';
    this.climbPrompt = '';
    this.exploreActive = false;
    this.paused = false;
    this.worldTimeHours = 0;
    this.lastAppliedSunHour = null;
    this.weatherPhase = 'dry';
    this.weatherRemainingSeconds = 0;
    this.worldCycleUnsubscribe = null;
    this.radioAudio = null;
    this.objectives = null;
    this.latestGameSnapshot = null;
    this.framePosition = null;
    this.objectiveChime = new ObjectiveChime();
    this.objectiveChime.setEnabled(this.soundEnabled);
    this.allObjectivesAnnounced = false;
    this.saveState = saveState;
    this.savePosition = new THREE.Vector3();
    this.saveFacing = new THREE.Vector3();
    this.debugPosition = new THREE.Vector3();
  }

  async start() {
    this.app = new PondApp(this.container, {
      mode: 'game',
      groundReservations: POND_GAME.groundReservations,
      enablePondStoneInteraction: false,
      antCameraFollow: POND_GAME.antCameraFollow,
      antMovement: POND_GAME.antMovement,
      antMovementRadius: POND_GAME.antMovementRadius,
      sunHour: POND_GAME.time.startHour,
      season: this.season,
    });
    await this.app.start();
    this.app.setView('ant', true);
    this.radioAudio = new PondRadioAudio(this.app, {
      onCaption: (text, duration) => this.onRadioCaption(text, duration),
      language: this.language,
      musicVolume: this.musicVolume,
    });
    this.radioAudio.start();
    this.objectives = new PondGameObjectives(this.app, {
      onChange: () => this.emitGameState(),
      onAllComplete: () => this.announceAllObjectives(),
      language: this.language,
    });
    this.objectives.start();
    this.startWorldCycle();
    this.game = new SeedToBurrowGame(this.app, {
      onStateChange: (snapshot) => {
        this.latestGameSnapshot = snapshot;
        this.objectives?.setSeedSnapshot(snapshot);
        this.emitGameState();
      },
      onPromptChange: (prompt) => {
        this.loopPrompt = prompt;
        this.emitPrompt();
      },
    });
    this.game.setSoundEnabled(this.soundEnabled);
    this.climbing = new AntClimbing(this.app, {
      onPromptChange: (prompt) => {
        this.climbPrompt = prompt;
        this.emitPrompt();
      },
    });
    this.game.start();
    this.climbing.start();
    this.restoreSaveState(this.saveState);
    return this;
  }

  getSaveState() {
    if (!this.app || !this.game || !this.objectives) return null;
    const position = this.getSavePosition();
    if (!position) return null;
    const facing = this.app.getAntFacingDirection(this.saveFacing);
    return {
      version: 1,
      worldTimeHours: this.worldTimeHours,
      ant: {
        x: position.x,
        z: position.z,
        heading: facing ? Math.atan2(facing.x, facing.z) : null,
      },
      game: this.game.getSaveState(),
      objectives: this.objectives.getSaveState(),
    };
  }

  getSavePosition() {
    if (this.isClimbing()) {
      return this.climbing?.findDismountPosition?.() ?? null;
    }
    return this.app?.getAntWorldPosition(this.savePosition) ?? null;
  }

  getAntWorldPosition() {
    return this.app?.getAntWorldPosition(this.debugPosition) ?? null;
  }

  restoreSaveState(state) {
    if (!state || state.version !== 1 || !this.app) return false;
    if (Number.isFinite(state.worldTimeHours)) {
      this.worldTimeHours = this.wrapHour(state.worldTimeHours);
      this.applyWorldTime(true);
      this.onTimeChange(this.worldTimeHours);
    }
    this.game?.restoreSaveState(state.game);
    this.objectives?.restoreSaveState(state.objectives);
    this.objectives?.setWorldState({
      hour: this.worldTimeHours,
      raining: this.weatherPhase === 'rain',
    });
    const ant = state.ant;
    if (Number.isFinite(ant?.x) && Number.isFinite(ant?.z)) {
      this.clearMovementInput();
      const moved = this.app.moveAntNear(ant.x, ant.z, { maximumSearchDistance: 2.4 });
      if (moved && Number.isFinite(ant.heading)) {
        const landing = this.app.getAntWorldPosition(this.savePosition);
        if (landing) this.app.setAntPose(landing, { heading: ant.heading, moving: false });
      }
      if (moved) this.app.setView('ant', true);
    }
    this.emitGameState();
    return true;
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.objectives?.setPaused(this.paused);
    this.game?.setPaused(paused);
    this.climbing?.setPaused(paused);
    this.clearMovementInput();
  }

  clearMovementInput() {
    this.app?.clearAntMovement();
    this.climbing?.clearMovementInput();
  }

  setMovementAxes(horizontal, forward) {
    if (!this.app) return false;
    const blocked = this.paused || this.exploreActive;
    const x = blocked ? 0 : horizontal;
    const y = blocked ? 0 : forward;
    this.climbing?.setMovementAxes(x, y);
    this.app.setAntMovementAxes(this.isClimbing() ? 0 : x, this.isClimbing() ? 0 : y);
    return true;
  }

  resetCameraView() {
    if (!this.app || this.paused || this.exploreActive) return false;
    return this.app.resetAntCameraView();
  }

  setMovementKey(direction, pressed) {
    if (!this.app) return false;
    if (this.paused || this.exploreActive) pressed = false;
    if (this.isFlightEnabled()) {
      this.app.setAntMovementKey(direction, pressed);
      return true;
    }
    const climbing = this.climbing?.setMovementKey(direction, pressed);
    this.app.setAntMovementKey(direction, climbing ? false : pressed);
    return true;
  }

  setAntRunning(enabled) {
    if (!this.app) return false;
    this.app.setAntRunning(Boolean(enabled) && !this.paused && !this.exploreActive && !this.isClimbing());
    return true;
  }

  isClimbing() {
    return this.climbing?.isClimbing() ?? false;
  }

  toggleClimb() {
    if (this.paused || this.exploreActive || this.isFlightEnabled()) return false;
    const previousPhase = this.isClimbing();
    const result = this.climbing?.toggleSurfaceRoam() ?? false;
    if (this.isClimbing() !== previousPhase) this.clearMovementInput();
    return result;
  }

  toggleClimbDebug() {
    const enabled = this.climbing?.toggleDebug() ?? false;
    if (!enabled) this.app?.setAntFlightEnabled(false);
    this.game?.setDebugMode(enabled);
    this.objectives?.setDebugEnabled(enabled);
    return enabled;
  }

  isClimbDebugAvailable() {
    return POND_GAME.debug?.enabled === true || POND_GAME.debug?.allowToggle === true;
  }

  isClimbDebugEnabled() {
    return this.climbing?.isDebugEnabled() ?? false;
  }

  toggleFlight() {
    if (!this.isClimbDebugEnabled() || !this.app) return false;
    if (!this.isFlightEnabled() && !this.climbing?.exitSurfaceForDebug()) return false;
    this.clearMovementInput();
    const enabled = this.app.setAntFlightEnabled(!this.app.isAntFlightEnabled(), {
      speedMultiplier: POND_GAME.debug?.flightSpeedMultiplier,
    });
    this.climbing?.setDebugOverlayVisible(!enabled);
    return enabled;
  }

  isFlightEnabled() {
    return this.app?.isAntFlightEnabled() ?? false;
  }

  canDebugRelocateAnt() {
    return Boolean(
      this.app
      && this.exploreActive
      && this.isClimbDebugEnabled()
      && POND_GAME.debug?.allowExploreRelocation === true
      && !this.isClimbing()
    );
  }

  debugRelocateAnt(clientX, clientY) {
    if (!this.canDebugRelocateAnt()) return false;
    const destination = this.app.getAntGroundPositionFromScreen(clientX, clientY);
    if (!destination) return false;
    this.clearMovementInput();
    const moved = this.app.moveAntNear(destination.x, destination.z, {
      maximumSearchDistance: POND_GAME.climbing.debug?.relocationSearchRadius,
    });
    if (moved) this.climbing?.handleAntRelocated();
    return moved;
  }

  setExploreActive(active) {
    const nextActive = Boolean(active);
    if (!this.app || nextActive === this.exploreActive) return true;
    this.exploreActive = nextActive;
    this.clearMovementInput();
    this.app.setExploreTouchMode?.(nextActive);
    this.climbing?.setExploreActive(nextActive);
    this.app.setAntLocatorActive(nextActive);
    this.app.setView(nextActive ? 'hero' : 'ant');
    this.game?.setExploreActive(nextActive);
    return true;
  }

  toggleExplore() {
    return this.setExploreActive(!this.exploreActive);
  }

  isExploreActive() {
    return this.exploreActive;
  }

  onFrame(listener) {
    return this.app?.onFrame(listener) ?? (() => {});
  }

  unlockSound() {
    this.game?.unlockSound();
    this.radioAudio?.unlock();
    this.objectiveChime?.unlock();
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
    this.objectiveChime?.setEnabled(enabled);
    this.game?.setSoundEnabled(enabled);
    return this.soundEnabled;
  }

  setMusicVolume(volume) {
    this.musicVolume = THREE.MathUtils.clamp(Number(volume) || 0, 0, 1);
    this.radioAudio?.setMusicVolume(this.musicVolume);
    return this.musicVolume;
  }

  setLanguage(language) {
    this.language = language === 'id' ? 'id' : 'en';
    this.radioAudio?.setLanguage(this.language);
    this.objectives?.setLanguage(this.language);
  }

  canDebugControlRadio() {
    return this.isClimbDebugEnabled() && POND_GAME.debug?.allowRadioControls === true;
  }

  cycleDebugRadioMusic() {
    if (!this.canDebugControlRadio()) return null;
    return this.radioAudio?.cycleMusicMode() ?? null;
  }

  playDebugRadioAnnouncement() {
    if (!this.canDebugControlRadio()) return false;
    return this.radioAudio?.playDebugAnnouncement() ?? false;
  }

  toggleFullscreen() {
    this.app?.toggleFullscreen();
  }

  focusScene() {
    this.app?.renderer.domElement.focus();
  }

  startWorldCycle() {
    const time = POND_GAME.time ?? {};
    this.worldTimeHours = this.wrapHour(time.startHour);
    this.applyWorldTime(true);
    this.scheduleWeather('dry');
    this.app.setRainEnabled(false);
    this.worldCycleUnsubscribe = this.app.onFrame((frame) => this.updateWorldCycle(frame));
  }

  updateWorldCycle({ delta = 0 } = {}) {
    if (this.paused || !this.app) return;
    const safeDelta = Math.max(0, Math.min(Number(delta) || 0, 0.25));
    const secondsPerGameHour = Number(POND_GAME.time?.secondsPerGameHour);
    if (POND_GAME.time?.enabled !== false && secondsPerGameHour > 0) {
      this.worldTimeHours = this.wrapHour(this.worldTimeHours + safeDelta / secondsPerGameHour);
      this.applyWorldTime();
    }
    this.onTimeChange(this.worldTimeHours);
    this.updateWeather(safeDelta);
    this.objectives?.setWorldState({
      hour: this.worldTimeHours,
      raining: this.weatherPhase === 'rain',
    });
    this.radioAudio?.update({
      delta: safeDelta,
      hour: this.worldTimeHours,
      raining: this.weatherPhase === 'rain',
      antPosition: this.app.getAntWorldPosition(this.framePosition ??= new THREE.Vector3()),
    });
  }

  updateWeather(delta) {
    const rain = POND_GAME.weather?.rain;
    if (POND_GAME.weather?.enabled === false || !rain) return;
    this.weatherRemainingSeconds -= delta;
    while (this.weatherRemainingSeconds <= 0) {
      this.weatherPhase = this.weatherPhase === 'rain' ? 'dry' : 'rain';
      this.scheduleWeather(this.weatherPhase);
      if (this.weatherPhase === 'rain') {
        this.app.setRainIntensity(this.randomBetween(rain.minimumIntensity, rain.maximumIntensity));
        this.app.setRainEnabled(true);
      } else {
        this.app.setRainEnabled(false);
      }
    }
  }

  scheduleWeather(phase) {
    const rain = POND_GAME.weather?.rain;
    if (!rain) return;
    const minimum = phase === 'rain' ? rain.minimumRainSeconds : rain.minimumDrySeconds;
    const maximum = phase === 'rain' ? rain.maximumRainSeconds : rain.maximumDrySeconds;
    this.weatherRemainingSeconds = this.randomBetween(minimum, maximum);
  }

  applyWorldTime(force = false) {
    const previous = this.lastAppliedSunHour;
    const changedEnough = previous === null
      || Math.abs(this.worldTimeHours - previous) >= (1 / 120)
      || (previous > 23 && this.worldTimeHours < 1);
    if (!force && !changedEnough) return;
    this.lastAppliedSunHour = this.worldTimeHours;
    this.app.setSunHour(this.worldTimeHours);
  }

  wrapHour(hour) {
    return ((Number(hour) % 24) + 24) % 24;
  }

  randomBetween(minimum, maximum) {
    const low = Number(minimum) || 0;
    const high = Math.max(low, Number(maximum) || low);
    return low + Math.random() * (high - low);
  }

  emitPrompt() {
    this.onPromptChange(this.climbPrompt || this.loopPrompt);
  }

  emitGameState() {
    if (!this.latestGameSnapshot) return;
    const checklist = this.objectives?.getSnapshot() ?? null;
    this.objectiveChime?.update(checklist);
    if (checklist?.completed === checklist?.total) this.announceAllObjectives();
    this.onStateChange({
      ...this.latestGameSnapshot,
      checklist,
    });
  }

  announceAllObjectives() {
    if (this.allObjectivesAnnounced) return;
    this.allObjectivesAnnounced = true;
    const interactions = POND_GAME.interactions ?? {};
    const message = translateMessage(
      interactions.allObjectivesMessageKey ?? 'interaction.allObjectives',
      this.language,
    );
    this.onRadioCaption(message, interactions.completionCaptionSeconds ?? 10, true);
    this.objectiveChime?.playCelebration();
  }

  dispose() {
    this.worldCycleUnsubscribe?.();
    this.worldCycleUnsubscribe = null;
    this.game?.dispose();
    this.climbing?.dispose();
    this.radioAudio?.dispose();
    this.radioAudio = null;
    this.objectives?.dispose();
    this.objectives = null;
    this.objectiveChime?.dispose();
    this.objectiveChime = null;
    this.app?.dispose();
    this.game = null;
    this.climbing = null;
    this.app = null;
  }
}
