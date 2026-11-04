import * as THREE from 'three';
import { translateMessage } from '../content/messages.js';
import { PondApp } from '../core/app.js';
import { AntClimbing } from './ant-climbing.js';
import { POND_GAME } from '../config/game.js';
import { DEFAULTS } from '../config/index.js';
import { PondGameObjectives } from './game-objectives.js';
import { ObjectiveChime } from './objective-chime.js';
import { PondRadioAudio } from './radio-audio.js';
import { AmbienceAudio } from './ambience-audio.js';
import { SeedToBurrowGame } from './seed-to-burrow.js';
import { MATERIAL_DEFINITIONS } from '../content/building.js';
import { BurrowBuilding } from './burrow-building.js';
import { BirdFlight, isBirdRewardUnlocked } from './bird-flight.js';

export class PondGameSession {
  constructor(container, {
    onStateChange = () => {},
    onPromptChange = () => {},
    onRadioCaption = () => {},
    onTimeChange = () => {},
    onLoadProgress = () => {},
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
    this.onLoadProgress = onLoadProgress;
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
    this.debugTimeHours = null;
    this.debugTimeFrozen = true;
    this.lastAppliedSunHour = null;
    this.weatherPhase = 'dry';
    this.debugWeatherOverride = false;
    this.weatherRemainingSeconds = 0;
    this.worldCycleUnsubscribe = null;
    this.radioAudio = null;
    this.audioListener = null;
    this.ambienceAudio = null;
    this.objectives = null;
    this.latestGameSnapshot = null;
    this.framePosition = null;
    this.objectiveChime = new ObjectiveChime();
    this.objectiveChime.setEnabled(this.soundEnabled);
    this.allObjectivesAnnounced = false;
    this.saveState = saveState;
    this.restoringUndergroundCheckpoint = saveState?.underground?.active === true;
    this.savePosition = new THREE.Vector3();
    this.saveFacing = new THREE.Vector3();
    this.debugPosition = new THREE.Vector3();
    this.bird = null;
    this.birdPreparing = false;
    this.colony = null;
    this.underground = null;
    this.undergroundDiscoveries = new Set(
      (Array.isArray(saveState?.underground?.discoveries) ? saveState.underground.discoveries : [])
        .filter((key) => ['nest', 'store', 'roots', 'quiet'].includes(key)),
    );
  }

  async start() {
    this.app = new PondApp(this.container, {
      mode: 'game',
      groundReservations: POND_GAME.groundReservations,
      enablePondStoneInteraction: false,
      antCameraFollow: POND_GAME.antCameraFollow,
      antMovement: POND_GAME.antMovement,
      antMovementRadius: POND_GAME.antMovementRadius,
      onLoadProgress: this.onLoadProgress,
      sunHour: POND_GAME.time.startHour,
      season: this.season,
    });
    await this.app.start();
    this.onLoadProgress(96);
    this.app.setView('ant', true);
    this.audioListener = new THREE.AudioListener();
    this.app.camera.add(this.audioListener);
    this.radioAudio = new PondRadioAudio(this.app, {
      onCaption: (text, duration) => this.onRadioCaption(text, duration),
      language: this.language,
      musicVolume: this.musicVolume,
      audioListener: this.audioListener,
    });
    this.radioAudio.start();
    this.ambienceAudio = new AmbienceAudio(this.app, this.audioListener);
    this.ambienceAudio.setEnabled(this.soundEnabled);
    this.ambienceAudio.start();
    this.objectives = new PondGameObjectives(this.app, {
      onChange: () => this.emitGameState(),
      onAllComplete: () => this.announceAllObjectives(),
      language: this.language,
    });
    this.objectives.start();
    this.startWorldCycle();
    this.game = new SeedToBurrowGame(this.app, {
      canCollectObject: () => !this.colony?.state.carried,
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
    this.app.readerClimbingController = this.climbing;
    this.game.start();
    this.climbing.start();
    this.bird = this.createBirdController();
    this.bird.setDebugEnabled(this.isClimbDebugEnabled());
    this.restoreSaveState(this.saveState);
    this.colony = new BurrowBuilding(this, this.saveState?.colony);
    this.colony.sync();
    await this.restoreUndergroundCheckpoint(this.saveState?.underground);
    this.onLoadProgress(99);
    return this;
  }

  getSaveState() {
    if (!this.app || !this.game || !this.objectives || this.restoringUndergroundCheckpoint) return null;
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
      colony: this.colony?.save(),
      game: this.game.getSaveState(),
      objectives: this.objectives.getSaveState(),
      underground: { ...this.underground?.getCheckpoint(), discoveries: [...this.undergroundDiscoveries] },
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

  getPlayerWorldPosition() {
    if (this.isUnderground()) return this.underground.position;
    return this.isBirdActive() ? this.bird.position : this.getAntWorldPosition();
  }

  prepareUndergroundMapSurface() {
    return this.isUnderground() ? this.underground.prepareMapSurface() : Promise.resolve(null);
  }

  getBuildingStatus() {
    if (this.colony?.planning) return 'building.preview';
    if (this.colony?.state.carried) return MATERIAL_DEFINITIONS[this.colony.state.carried.type].carryStatusKey;
    if (this.game?.carriedSeed) return 'building.carrySeed';
    return '';
  }
  getBuildingActions() { return this.colony?.actions() ?? []; }
  performBuildingAction(id) { return this.colony?.act(id) ?? false; }
  getMaterialStorage() {
    return { leaves: this.colony?.state.count('leaf') ?? 0, bedBuilt: Boolean(this.colony?.state.bed),
      materials: this.colony?.inventory() ?? [], recipes: this.colony?.recipeOptions() ?? [] };
  }
  takeStoredMaterial(type) { return this.colony?.take(type) ?? false; }
  planBuild(recipeId) { return this.colony?.startPlan(recipeId) ?? false; }
  takeStoredLeaf() { return this.takeStoredMaterial('leaf'); }
  planLeafBed() { return this.planBuild('leaf-bed'); }

  getUndergroundMapData() {
    return this.isUnderground() ? { ...this.underground.getMapData(), colony: this.colony?.markers() } : null;
  }

  isUnderground() {
    return this.underground?.active ?? false;
  }

  canUseBurrow() {
    if (!this.app || this.paused || this.exploreActive || this.isBirdActive()
      || this.isClimbing() || this.isFlightEnabled() || this.birdPreparing
      || this.app.isAntAnimationBusy()) return false;
    if (this.isUnderground()) return this.underground.canExit();
    const position = this.getAntWorldPosition();
    const entrance = this.game?.burrowPosition;
    return Boolean(position && entrance
      && Math.hypot(position.x - entrance.x, position.z - entrance.z) <= POND_GAME.sleep.radius);
  }

  async restoreUndergroundCheckpoint(checkpoint) {
    if (checkpoint?.active !== true) return false;
    this.restoringUndergroundCheckpoint = true;
    await this.prepareUnderground((value) => this.onLoadProgress(96 + value * 0.03));
    const restored = this.setUndergroundActive(true, checkpoint);
    // A failed load must preserve the last checkpoint instead of autosaving outside.
    this.restoringUndergroundCheckpoint = !restored;
    return restored;
  }

  async prepareUnderground(onProgress = () => {}) {
    if (this.underground) return;
    const app = this.app;
    const { UndergroundWorld } = await import('./underground.js');
    if (!app || app !== this.app || app.disposed) throw new Error('Session ended during burrow loading.');
    const interior = new UndergroundWorld(app);
    interior.walkLift = (x,z) => this.colony?.walkLift(x,z) ?? 0;
    try {
      await interior.start({ onProgress });
      if (app !== this.app || app.disposed) throw new Error('Session ended during burrow loading.');
      this.underground = interior;
    } catch (error) {
      interior.dispose();
      throw error;
    }
  }

  setUndergroundActive(active, checkpoint = null) {
    if (!this.app || !this.underground) return false;
    this.clearMovementInput();
    this.exploreActive = false;
    this.app.setExploreTouchMode(false);
    this.app.setAntLocatorActive(false);
    if (active) {
      this.underground.activate(checkpoint);
      this.underground.setPaused(this.paused);
      this.app.controls.enabled = false;
      this.app.setAlternateRuntime(this.underground);
      this.radioAudio?.setEnabled(false);
      this.ambienceAudio?.setEnabled(false);
    } else {
      this.underground.deactivate();
      this.app.setAlternateRuntime(null);
      this.app.setView('ant', true);
      this.radioAudio?.setEnabled(true);
      this.ambienceAudio?.setEnabled(this.soundEnabled);
    }
    this.colony?.sync();
    this.setPaused(this.paused);
    this.emitPrompt();
    return true;
  }

  canPlayBird() {
    return Boolean(!this.isUnderground() && !this.colony?.busyHands && this.bird && (
      POND_GAME.debug.enabled || isBirdRewardUnlocked(this.objectives?.getSnapshot())
    ));
  }

  isBirdActive() {
    return this.bird?.active ?? false;
  }

  createBirdController() {
    return new BirdFlight(this.app, POND_GAME.birdFlight, {
      extraObstacles: [this.game.burrow?.getObjectByName('Rounded burrow boulder cave')].filter(Boolean),
    });
  }

  isBirdPreparing() {
    return this.birdPreparing;
  }

  async toggleBird() {
    if (!this.app || this.paused || this.birdPreparing || !this.canPlayBird()) return false;
    if (!this.bird.ready) {
      const app = this.app;
      const bird = this.bird;
      this.birdPreparing = true;
      this.emitGameState();
      try {
        await bird.start();
      } catch (error) {
        bird.dispose();
        if (this.app === app && !app.disposed) this.bird = this.createBirdController();
        throw error;
      } finally {
        this.birdPreparing = false;
        if (this.app === app && !app.disposed) this.emitGameState();
      }
      if (this.app !== app || app.disposed || this.paused) return false;
      this.bird.setDebugEnabled(this.isClimbDebugEnabled());
    }
    this.clearMovementInput();
    if (this.isBirdActive()) {
      this.bird.deactivate();
      this.exploreActive = false;
      this.app.setAntMotionLocked(this.isClimbing());
      this.app.setView('ant');
    } else {
      if (this.isFlightEnabled()) this.app.setAntFlightEnabled(false);
      if (!this.bird.activate()) return false;
      this.exploreActive = false;
      this.app.setAntMotionLocked(true);
    }
    this.app.setExploreTouchMode(false);
    this.app.setAntLocatorActive(false);
    this.climbing?.setExploreActive(this.isBirdActive());
    this.game?.setExploreActive(this.isBirdActive());
    this.game?.setPaused(this.isBirdActive());
    this.objectives?.setPaused(this.isBirdActive());
    this.emitPrompt();
    this.emitGameState();
    return true;
  }

  getCameraDebugValues() {
    if (this.isUnderground()) return {
      position: this.underground.camera.position,
      target: this.underground.controls.target,
      rotation: this.underground.camera.rotation,
    };
    if (!this.app?.camera || !this.app?.controls) return null;
    return {
      position: this.app.camera.position,
      target: this.app.controls.target,
      rotation: this.app.camera.rotation,
    };
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
    this.objectives?.setPaused(this.paused || this.isBirdActive() || this.isUnderground());
    this.game?.setPaused(this.paused || this.isBirdActive() || this.isUnderground());
    this.climbing?.setPaused(this.paused || this.isUnderground());
    this.bird?.setPaused(paused);
    this.underground?.setPaused(paused);
    this.clearMovementInput();
    if (this.isUnderground()) this.emitPrompt();
  }

  clearMovementInput() {
    this.app?.clearAntMovement();
    this.climbing?.clearMovementInput();
    this.bird?.clearInput();
    this.underground?.clearInput();
  }

  setMovementAxes(horizontal, forward) {
    if (!this.app) return false;
    const blocked = this.paused || this.exploreActive;
    const x = blocked ? 0 : horizontal;
    const y = blocked ? 0 : forward;
    if (this.isUnderground()) {
      this.underground.setMovementAxes(x, y);
      return true;
    }
    if (this.isBirdActive()) {
      this.bird.setMovementAxes(x, y);
      return true;
    }
    this.climbing?.setMovementAxes(x, y);
    this.app.setAntMovementAxes(this.isClimbing() ? 0 : x, this.isClimbing() ? 0 : y);
    return true;
  }

  resetCameraView() {
    if (!this.app || this.paused || this.exploreActive) return false;
    if (this.isUnderground()) { this.underground.resetCamera(); return true; }
    return this.isBirdActive() ? this.bird.resetCamera() : this.app.resetAntCameraView();
  }

  setMovementKey(direction, pressed) {
    if (!this.app) return false;
    if (this.paused || this.exploreActive) pressed = false;
    if (this.isUnderground()) {
      this.underground.setMovementKey(direction, pressed);
      return true;
    }
    if (this.isBirdActive()) {
      this.bird.setMovementKey(direction, pressed);
      return true;
    }
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
    if (this.isUnderground()) {
      this.underground.setRunning(Boolean(enabled) && !this.paused && !this.exploreActive);
      return true;
    }
    if (this.isBirdActive()) return false;
    this.app.setAntRunning(Boolean(enabled) && !this.paused && !this.exploreActive && !this.isClimbing());
    return true;
  }

  isClimbing() {
    return this.climbing?.isClimbing() ?? false;
  }

  toggleClimb() {
    if (this.paused || this.exploreActive || this.isFlightEnabled() || this.isBirdActive() || this.isUnderground()) return false;
    const previousPhase = this.isClimbing();
    const result = this.climbing?.toggleSurfaceRoam() ?? false;
    if (this.isClimbing() !== previousPhase) this.clearMovementInput();
    return result;
  }

  toggleClimbDebug() {
    const enabled = this.climbing?.toggleDebug() ?? false;
    if (!enabled) this.clearDebugTime();
    if (!enabled && this.isFlightEnabled()) this.app?.setAntFlightEnabled(false);
    this.game?.setDebugMode(enabled);
    this.objectives?.setDebugEnabled(enabled);
    this.bird?.setDebugEnabled(enabled);
    return enabled;
  }

  isClimbDebugAvailable() {
    return POND_GAME.debug?.enabled === true || POND_GAME.debug?.allowToggle === true;
  }

  isClimbDebugEnabled() {
    return this.climbing?.isDebugEnabled() ?? false;
  }

  debugSkipToOffering() {
    if (!this.isClimbDebugAvailable() || !this.isClimbDebugEnabled()) return false;
    return this.game?.debugSkipToOffering() ?? false;
  }

  debugCompleteObjective(id) {
    if (!this.isClimbDebugAvailable() || !this.isClimbDebugEnabled()) return false;
    if (id === 'seeds') return this.game?.debugSkipToOffering() ?? false;
    if (id === 'offering') return this.game?.debugCompleteOffering() ?? false;
    return this.objectives?.debugComplete(id) ?? false;
  }

  toggleFlight() {
    if (!this.isClimbDebugEnabled() || !this.app || this.isBirdActive() || this.isUnderground() || this.colony?.busyHands) return false;
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
      && !this.isBirdActive()
      && !this.isUnderground()
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
    if (this.isUnderground()) {
      this.underground.setExploreActive(nextActive);
      this.emitPrompt();
      return true;
    }
    this.app.setExploreTouchMode?.(nextActive);
    this.climbing?.setExploreActive(nextActive || this.isBirdActive());
    this.app.setAntLocatorActive(nextActive && !this.isBirdActive());
    this.bird?.setSuspended(nextActive);
    if (nextActive) this.app.setView('explore');
    else if (this.isBirdActive()) this.bird.resetCamera();
    else this.app.setView('ant');
    this.game?.setExploreActive(nextActive || this.isBirdActive());
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
    this.ambienceAudio?.unlock();
    this.objectiveChime?.unlock();
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
    this.objectiveChime?.setEnabled(enabled);
    this.game?.setSoundEnabled(enabled);
    this.ambienceAudio?.setEnabled(enabled && !this.isUnderground());
    return this.soundEnabled;
  }

  playCardReveal() {
    this.objectiveChime?.playCardReveal();
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
    return !this.isUnderground() && this.isClimbDebugEnabled() && POND_GAME.debug?.allowRadioControls === true;
  }

  canDebugControlWeather() {
    return POND_GAME.debug?.enabled === true;
  }

  toggleDebugRain() {
    if (!this.canDebugControlWeather() || !this.app) return null;
    const phase = this.weatherPhase === 'rain' ? 'dry' : 'rain';
    this.debugWeatherOverride = true;
    this.weatherPhase = phase;
    this.scheduleWeather(phase);
    if (phase === 'rain') {
      const rain = POND_GAME.weather?.rain;
      if (rain) this.app.setRainIntensity(this.randomBetween(rain.minimumIntensity, rain.maximumIntensity));
    }
    this.app.setRainEnabled(phase === 'rain');
    return phase;
  }

  cycleDebugRadioMusic() {
    if (!this.canDebugControlRadio()) return null;
    return this.radioAudio?.cycleMusicMode() ?? null;
  }

  playDebugRadioAnnouncement() {
    if (!this.canDebugControlRadio()) return false;
    return this.radioAudio?.playDebugAnnouncement() ?? false;
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

  canAdjustRadio() {
    return Boolean(this.app && !this.paused && !this.exploreActive && !this.isBirdActive() && !this.isUnderground()
      && !this.isFlightEnabled() && this.climbing?.isOnRadio());
  }

  canSleep() {
    return Boolean(this.app && this.game && !this.paused && !this.exploreActive
      && !this.isBirdActive() && !this.isFlightEnabled() && !this.birdPreparing);
  }

  sleepUntil(choice) {
    if (!this.app || !['morning', 'evening'].includes(choice)) return false;
    const target = POND_GAME.sleep[`${choice}Hour`];
    if (!Number.isFinite(target)) return false;
    this.worldTimeHours = this.wrapHour(target);
    this.debugTimeHours = null;
    this.refreshDebugTime();
    return true;
  }

  getCurrentWorldHour() {
    return this.debugTimeHours ?? this.worldTimeHours;
  }

  setDebugTime(hour, { freeze = true } = {}) {
    if (!POND_GAME.debug.enabled || !this.app || !Number.isFinite(hour)) return false;
    this.debugTimeHours = this.wrapHour(hour);
    this.debugTimeFrozen = Boolean(freeze);
    this.refreshDebugTime();
    return true;
  }

  setDebugTimeFrozen(frozen) {
    if (!POND_GAME.debug.enabled || this.debugTimeHours === null) return false;
    this.debugTimeFrozen = Boolean(frozen);
    return true;
  }

  clearDebugTime() {
    if (this.debugTimeHours === null) return;
    this.debugTimeHours = null;
    this.refreshDebugTime();
  }

  refreshDebugTime() {
    if (!this.app) return;
    this.applyWorldTime(true);
    const hour = this.getCurrentWorldHour();
    this.onTimeChange(hour);
    this.objectives?.setWorldState({ hour, raining: this.weatherPhase === 'rain' });
  }

  updateWorldCycle({ delta = 0 } = {}) {
    if (this.paused || !this.app || this.isUnderground()) return;
    const safeDelta = Math.max(0, Math.min(Number(delta) || 0, 0.25));
    const secondsPerGameHour = Number(POND_GAME.time?.secondsPerGameHour);
    if (POND_GAME.time?.enabled !== false && secondsPerGameHour > 0) {
      this.worldTimeHours = this.wrapHour(this.worldTimeHours + safeDelta / secondsPerGameHour);
      if (this.debugTimeHours !== null && !this.debugTimeFrozen) {
        this.debugTimeHours = this.wrapHour(this.debugTimeHours + safeDelta / secondsPerGameHour);
      }
      this.applyWorldTime();
    }
    const hour = this.getCurrentWorldHour();
    this.onTimeChange(hour);
    this.updateWeather(safeDelta);
    this.objectives?.setWorldState({
      hour,
      raining: this.weatherPhase === 'rain',
    });
    this.radioAudio?.update({
      delta: safeDelta,
      hour,
      raining: this.weatherPhase === 'rain',
      antPosition: this.app.getAntWorldPosition(this.framePosition ??= new THREE.Vector3()),
    });
    this.ambienceAudio?.update(
      safeDelta,
      hour,
      this.weatherPhase === 'rain',
    );
  }

  updateWeather(delta) {
    if (this.debugWeatherOverride) return;
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
    const hour = this.getCurrentWorldHour();
    const previous = this.lastAppliedSunHour;
    const changedEnough = previous === null
      || Math.abs(hour - previous) >= (1 / 120)
      || (previous > 23 && hour < 1);
    if (!force && !changedEnough) return;
    this.lastAppliedSunHour = hour;
    this.app.setSunHour(hour);
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
    if (this.isUnderground()) {
      this.onPromptChange(this.exploreActive ? 'underground.prompt.explore' : 'underground.prompt.walk');
      return;
    }
    this.onPromptChange(this.isBirdActive() ? 'prompt.bird.flight' : this.climbPrompt || this.loopPrompt);
  }

  emitGameState() {
    if (!this.latestGameSnapshot) return;
    const checklist = this.objectives?.getSnapshot() ?? null;
    this.objectiveChime?.update(checklist);
    if (checklist?.completed === checklist?.total) this.announceAllObjectives();
    this.onStateChange({
      ...this.latestGameSnapshot,
      checklist,
      birdUnlocked: this.canPlayBird(),
      birdActive: this.isBirdActive(),
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
    this.colony?.dispose();
    this.colony = null;
    this.app?.setAlternateRuntime(null);
    this.underground?.dispose();
    this.underground = null;
    this.bird?.dispose();
    this.bird = null;
    if (this.app?.readerClimbingController === this.climbing) {
      this.app.readerClimbingController = null;
    }
    this.game?.dispose();
    this.climbing?.dispose();
    this.radioAudio?.dispose();
    this.radioAudio = null;
    this.ambienceAudio?.dispose();
    this.ambienceAudio = null;
    this.objectives?.dispose();
    this.objectives = null;
    this.objectiveChime?.dispose();
    this.objectiveChime = null;
    this.audioListener?.removeFromParent();
    this.audioListener?.gain?.disconnect();
    this.audioListener = null;
    this.app?.dispose();
    this.game = null;
    this.climbing = null;
    this.app = null;
  }
}
