import { PondGameSession } from './game/game-session.js';
import { APP_VERSION, DEFAULTS, SEASONS } from './config/index.js';
import { POND_GAME } from './config/game.js';
import { GAME_OBJECTIVES } from './content/objectives.js';
import {
  PERFORMANCE_DIAGNOSTIC,
  QUALITY_PROFILE_NAME,
  QUALITY_STORAGE_KEY,
  requestedQualityProfile,
  storedQualityPreference,
} from './config/quality.js';
import { formatSeedProgress, translate } from './ui/localization.js';
import { FpsSampler } from './utils/fps-diagnostic.js';

const byId = (id) => document.getElementById(id);

// Track actual input so touch focus stays quiet and keyboard focus remains visible.
document.addEventListener('pointerdown', () => {
  document.documentElement.dataset.inputMethod = 'pointer';
  session?.unlockSound();
}, { capture: true, passive: true });
document.addEventListener('keydown', () => {
  document.documentElement.dataset.inputMethod = 'keyboard';
}, { capture: true });

const elements = {
  scene: byId('scene'),
  objective: byId('game-objective-title'),
  prompt: byId('game-prompt'),
  step: byId('game-step'),
  progress: document.querySelector('.game-progress'),
  progressFill: byId('game-progress-fill'),
  pauseButton: byId('pause-button'),
  settingsButton: byId('settings-button'),
  exploreButton: byId('explore-button'),
  resetCameraButton: byId('reset-camera-button'),
  fullscreenButton: byId('fullscreen-button'),
  aboutShortcut: byId('about-shortcut'),
  aboutDialog: byId('about-dialog'),
  aboutCard: byId('about-card'),
  aboutTitle: byId('about-title'),
  closeAboutButton: byId('close-about-button'),
  gameVersion: byId('game-version'),
  debugCoordinates: byId('debug-coordinates'),
  debugCoordinateValues: byId('debug-coordinate-values'),
  antHint: byId('ant-hint'),
  exploreHint: byId('explore-hint'),
  touchHint: byId('touch-hint'),
  debugKeyHint: byId('debug-key-hint'),
  debugRelocateHint: byId('debug-relocate-hint'),
  pauseDialog: byId('pause-dialog'),
  settingsDialog: byId('settings-dialog'),
  settingsCard: byId('settings-card'),
  settingsTitle: byId('settings-title'),
  closeSettingsButton: byId('close-settings-button'),
  resumeButton: byId('resume-button'),
  restartButton: byId('restart-button'),
  newGameButton: byId('new-game-button'),
  saveSlotList: byId('save-slot-list'),
  soundEnabled: byId('sound-enabled'),
  musicVolume: byId('music-volume'),
  musicVolumeValue: byId('music-volume-value'),
  seasonSelect: byId('season-select'),
  qualitySelect: byId('quality-select'),
  applyQualityButton: byId('apply-quality-button'),
  qualityError: byId('quality-error'),
  loading: byId('loading'),
  loadingProgress: byId('loading-progress'),
  loadingPercentage: byId('loading-percentage'),
  loadingBarFill: byId('loading-bar-fill'),
  errorMessage: byId('error-message'),
  radioCaption: byId('radio-caption'),
  gameTime: byId('game-time'),
  performanceDiagnostic: byId('performance-diagnostic'),
  performanceDiagnosticEnabled: byId('performance-diagnostic-enabled'),
  fpsValue: byId('fps-value'),
  fpsWarning: byId('fps-warning'),
  checklist: byId('game-checklist-list'),
  checklistPanel: document.querySelector('.game-checklist'),
  checklistToggle: byId('checklist-toggle'),
  checklistLabel: document.querySelector('#checklist-toggle span'),
  checklistBody: byId('checklist-body'),
  radioDebugHint: byId('radio-debug-hint'),
  languageSelect: byId('language-select'),
  movementJoystick: byId('movement-joystick'),
  movementKnob: byId('movement-knob'),
  runButton: byId('run-button'),
  climbButton: byId('climb-button'),
};

const antMovementKeys = new Map([
  ['KeyW', 'forward'],
  ['KeyS', 'backward'],
  ['KeyA', 'left'],
  ['KeyD', 'right'],
  ['ArrowUp', 'forward'],
  ['ArrowDown', 'backward'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
]);
const heldMovementCodes = new Set();
const heldRunCodes = new Set();
const heldFlightCodes = new Set();
let touchRunHeld = false;
let resetMobileControls = null;

let session = null;
let paused = false;
let gameReady = false;
let debugRelocateCleanup = null;
const LANGUAGE_KEY = 'the-quiet-pond-language';
const SEASON_KEY = 'the-quiet-pond-season';
const PERFORMANCE_DIAGNOSTIC_KEY = 'the-quiet-pond-performance-diagnostic';
const SOUND_EFFECTS_KEY = 'the-quiet-pond-soft-chimes';
const MUSIC_VOLUME_KEY = 'the-quiet-pond-music-volume';
const SAVE_SLOTS_KEY = 'the-quiet-pond-saves-v1';
const ACTIVE_SAVE_SLOT_KEY = 'the-quiet-pond-active-save-slot-v1';
let language = readStoredValue(LANGUAGE_KEY) === 'id' ? 'id' : 'en';
let season = readSeasonPreference();
let soundEffectsEnabled = readStoredValue(SOUND_EFFECTS_KEY) !== '0';
let musicVolume = readMusicVolumePreference();
const initialSeedTotal = Math.max(1, Number(POND_GAME.seed.totalCount) || 1);
elements.progress.setAttribute('aria-valuemax', String(initialSeedTotal));
elements.step.textContent = formatSeedProgress(0, initialSeedTotal, language);
elements.soundEnabled.checked = soundEffectsEnabled;
elements.seasonSelect.value = season;
elements.musicVolume.value = String(Math.round(musicVolume * 100));
elements.musicVolumeValue.value = `${Math.round(musicVolume * 100)}%`;
elements.musicVolumeValue.textContent = `${Math.round(musicVolume * 100)}%`;
let performanceDiagnosticEnabled = readStoredValue(PERFORMANCE_DIAGNOSTIC_KEY) === '1';
let latestSnapshot = null;
let latestPrompt = '';
let mobileMovementCleanup = null;
let aboutPausedGame = false;
let settingsPausedGame = false;
const SAVE_SLOT_COUNT = 3;
let saveSlots = readSaveSlots();
let activeSaveSlotIndex = readActiveSaveSlot();
let saveTimeout = null;
let suppressSaveOnUnload = false;
let lastDisplayedGameMinute = null;
let latestGameHour = 10.5;
let debugCoordinateInterval = null;
let lastDebugCoordinateText = '';
let performanceDiagnosticUnsubscribe = null;
const fpsSampler = new FpsSampler({
  sampleSeconds: PERFORMANCE_DIAGNOSTIC.sampleSeconds,
  warningFps: PERFORMANCE_DIAGNOSTIC.warningFps[QUALITY_PROFILE_NAME],
  recoveryMargin: PERFORMANCE_DIAGNOSTIC.recoveryMargin,
});
const DEBUG_COORDINATE_UPDATE_MS = 100;

function readStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readMusicVolumePreference() {
  const stored = readStoredValue(MUSIC_VOLUME_KEY);
  const fallback = Math.min(1, Math.max(0, Number(POND_GAME.radioAudio.musicVolume) || 0));
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function readSeasonPreference() {
  const stored = readStoredValue(SEASON_KEY);
  return Object.hasOwn(SEASONS, stored) ? stored : DEFAULTS.season;
}

function updateMusicVolume(value, persist = true) {
  musicVolume = Math.min(1, Math.max(0, Number(value) / 100 || 0));
  const percentage = Math.round(musicVolume * 100);
  elements.musicVolumeValue.value = `${percentage}%`;
  elements.musicVolumeValue.textContent = `${percentage}%`;
  session?.setMusicVolume(musicVolume);
  if (!persist) return;
  try {
    window.localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume));
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store the music volume preference.', error);
  }
}

function readSaveSlots() {
  try {
    const stored = JSON.parse(readStoredValue(SAVE_SLOTS_KEY));
    return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => (
      stored?.[index]?.state?.version === 1 ? stored[index] : null
    ));
  } catch {
    return Array(SAVE_SLOT_COUNT).fill(null);
  }
}

function readActiveSaveSlot() {
  const stored = Number(readStoredValue(ACTIVE_SAVE_SLOT_KEY));
  return Number.isInteger(stored) && stored >= 0 && stored < SAVE_SLOT_COUNT ? stored : 0;
}

function persistSaveSlots() {
  try {
    window.localStorage.setItem(SAVE_SLOTS_KEY, JSON.stringify(saveSlots));
    window.localStorage.setItem(ACTIVE_SAVE_SLOT_KEY, String(activeSaveSlotIndex));
    return true;
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store save data.', error);
    return false;
  }
}

function formatSaveDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(language === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderSaveSlots() {
  if (!elements.saveSlotList) return;
  elements.saveSlotList.replaceChildren();
  saveSlots.forEach((save, index) => {
    const row = document.createElement('div');
    row.className = 'save-slot';
    row.classList.toggle('is-active', index === activeSaveSlotIndex);
    const copy = document.createElement('div');
    copy.className = 'save-slot__copy';
    const name = document.createElement('span');
    name.className = 'save-slot__name';
    name.textContent = t('ui.save.slot', { number: index + 1 });
    const meta = document.createElement('span');
    meta.className = 'save-slot__meta';
    if (save) {
      const progress = `${save.completedObjectives ?? 0}/${save.totalObjectives ?? 10}`;
      const current = index === activeSaveSlotIndex ? ` - ${t('Current save')}` : '';
      meta.textContent = `${t('Last played')} ${formatSaveDate(save.updatedAt)} - ${progress}${current}`;
      if (index === activeSaveSlotIndex) meta.classList.add('save-slot__current');
    } else {
      meta.textContent = t('Empty');
    }
    copy.append(name, meta);
    row.append(copy);

    if (save) {
      const load = document.createElement('button');
      load.type = 'button';
      load.textContent = index === activeSaveSlotIndex ? t('Current save') : t('Load');
      load.disabled = index === activeSaveSlotIndex;
      load.addEventListener('click', () => loadSaveSlot(index));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'save-slot__delete';
      remove.textContent = t('Delete');
      remove.addEventListener('click', () => deleteSaveSlot(index));
      row.append(load, remove);
    } else {
      const start = document.createElement('button');
      start.type = 'button';
      start.textContent = t('Start here');
      start.addEventListener('click', () => startNewGame(index));
      row.append(start);
    }
    elements.saveSlotList.append(row);
  });
}

function saveActiveSlot() {
  if (suppressSaveOnUnload) return false;
  const state = session?.getSaveState();
  if (!state) return false;
  const checklist = latestSnapshot?.checklist;
  saveSlots[activeSaveSlotIndex] = {
    state,
    updatedAt: Date.now(),
    completedObjectives: checklist?.completed ?? 0,
    totalObjectives: checklist?.total ?? GAME_OBJECTIVES.length,
  };
  const stored = persistSaveSlots();
  if (stored) renderSaveSlots();
  return stored;
}

function requestAutosave() {
  window.clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => saveActiveSlot(), 750);
}

function loadSaveSlot(index) {
  if (!saveSlots[index] || index === activeSaveSlotIndex) return;
  saveActiveSlot();
  activeSaveSlotIndex = index;
  persistSaveSlots();
  suppressSaveOnUnload = true;
  window.clearTimeout(saveTimeout);
  window.location.reload();
}

function startNewGame(index = saveSlots.findIndex((save) => !save)) {
  if (index < 0 || saveSlots[index]) {
    window.alert(t('All save slots are in use. Delete a save before starting a new game.'));
    return;
  }
  saveActiveSlot();
  activeSaveSlotIndex = index;
  persistSaveSlots();
  suppressSaveOnUnload = true;
  window.clearTimeout(saveTimeout);
  window.location.reload();
}

function deleteSaveSlot(index) {
  if (!saveSlots[index]) return;
  if (!window.confirm(t('Delete this save? This cannot be undone.'))) return;
  saveSlots[index] = null;
  if (index === activeSaveSlotIndex) {
    const nextSave = saveSlots.findIndex((save) => save);
    activeSaveSlotIndex = nextSave >= 0 ? nextSave : 0;
    persistSaveSlots();
    suppressSaveOnUnload = true;
    window.clearTimeout(saveTimeout);
    window.location.reload();
    return;
  }
  persistSaveSlots();
  renderSaveSlots();
}

function t(text, parameters = {}) {
  return translate(text, language, parameters);
}

function registerGameServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const workerUrl = `./service-worker.js?v=${encodeURIComponent(APP_VERSION)}`;
  navigator.serviceWorker.register(workerUrl, { scope: './' }).catch((error) => {
      console.warn('[the-quiet-pond] Service worker registration failed.', error);
  });
}

function applyLanguage() {
  document.documentElement.lang = language;
  elements.languageSelect.value = language;
  session?.setLanguage(language);
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });
  if (elements.gameVersion) {
    elements.gameVersion.textContent = translate('ui.version', language, { version: APP_VERSION });
  }
  renderSaveSlots();
  lastDisplayedGameMinute = null;
  updateGameTime(latestGameHour);
  updateExploreControl();
  setChecklistCollapsed(elements.checklistBody.hidden);
  elements.pauseButton.textContent = t(paused ? 'ui.resume' : 'ui.pause');
  if (!latestSnapshot) {
    elements.step.textContent = formatSeedProgress(
      0,
      Number(elements.progress.getAttribute('aria-valuemax')) || 1,
      language,
    );
  }
  if (latestSnapshot) updateGameState(latestSnapshot);
  if (latestPrompt) updatePrompt(latestPrompt);
}

function formatGameTime(hour) {
  const normalized = ((Number(hour) || 0) % 24 + 24) % 24;
  const totalMinutes = Math.round(normalized * 60) % (24 * 60);
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function updateGameTime(hour) {
  if (!elements.gameTime) return;
  latestGameHour = Number(hour) || 0;
  const normalized = ((Number(hour) || 0) % 24 + 24) % 24;
  const displayedMinute = Math.round(normalized * 60) % (24 * 60);
  if (displayedMinute === lastDisplayedGameMinute) return;
  lastDisplayedGameMinute = displayedMinute;
  elements.gameTime.textContent = formatGameTime(hour);
  elements.gameTime.setAttribute('aria-label', t('ui.time.valueAria', {
    time: elements.gameTime.textContent,
  }));
}

function syncPerformanceDiagnosticSubscription() {
  performanceDiagnosticUnsubscribe?.();
  performanceDiagnosticUnsubscribe = null;
  if (!performanceDiagnosticEnabled || !session) return;
  performanceDiagnosticUnsubscribe = session.onFrame(updatePerformanceDiagnostic);
}

function setPerformanceDiagnosticEnabled(enabled, persist = false) {
  performanceDiagnosticEnabled = Boolean(enabled);
  elements.performanceDiagnosticEnabled.checked = performanceDiagnosticEnabled;
  elements.performanceDiagnostic.hidden = !performanceDiagnosticEnabled;
  elements.performanceDiagnostic.classList.remove('is-low');
  elements.fpsWarning.hidden = true;
  elements.fpsValue.textContent = '--';
  fpsSampler.reset();
  syncPerformanceDiagnosticSubscription();
  if (!persist) return;
  try {
    window.localStorage.setItem(
      PERFORMANCE_DIAGNOSTIC_KEY,
      performanceDiagnosticEnabled ? '1' : '0',
    );
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store the performance diagnostic preference.', error);
  }
}

function updatePerformanceDiagnostic({ delta = 0 } = {}) {
  const sample = fpsSampler.update(delta);
  if (!sample) return;
  elements.fpsValue.textContent = String(sample.fps);
  elements.performanceDiagnostic.classList.toggle('is-low', sample.low);
  elements.fpsWarning.hidden = !sample.low;
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.matches('input, select, textarea, button, [contenteditable="true"]')
    || Boolean(target.closest('[contenteditable="true"]'))
  );
}

function canMoveAnt() {
  return gameReady
    && !paused
    && elements.settingsDialog.hidden
    && elements.aboutDialog.hidden
    && !session?.isExploreActive();
}

function syncRunning() {
  const running = canMoveAnt() && (touchRunHeld || heldRunCodes.size > 0);
  session?.setAntRunning(running);
  elements.runButton?.classList.toggle('is-held', running);
  elements.runButton?.setAttribute('aria-pressed', String(running));
}

function syncMovementDirection(direction) {
  let held = false;
  for (const code of heldMovementCodes) {
    if (antMovementKeys.get(code) === direction) held = true;
  }
  session?.setMovementKey(direction, held && canMoveAnt());
}

function clearGameInput() {
  heldMovementCodes.clear();
  heldRunCodes.clear();
  heldFlightCodes.clear();
  touchRunHeld = false;
  resetMobileControls?.();
  session?.clearMovementInput();
  syncRunning();
}

function resetCameraView() {
  if (!canMoveAnt()) return;
  session?.resetCameraView();
  requestAnimationFrame(() => session?.focusScene());
}

function updateGameState(snapshot) {
  latestSnapshot = snapshot;
  elements.objective.textContent = t(snapshot.objective);
  const totalSeeds = Math.max(1, Number(snapshot.totalSeeds) || 1);
  const depositedSeeds = Math.min(totalSeeds, Number(snapshot.depositedSeeds) || 0);
  elements.step.textContent = snapshot.complete
    ? t('status.offering.complete')
    : formatSeedProgress(depositedSeeds, totalSeeds, language);
  elements.progress.setAttribute('aria-valuemax', String(totalSeeds));
  elements.progress.setAttribute('aria-valuenow', String(depositedSeeds));
  elements.progressFill.style.width = `${(depositedSeeds / totalSeeds) * 100}%`;
  document.body.dataset.gamePhase = snapshot.phase;
  renderChecklist(snapshot.checklist);
  requestAutosave();
}

function renderChecklist(checklist) {
  if (!elements.checklist || !checklist?.tasks) return;
  elements.checklist.replaceChildren();
  checklist.tasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'game-checklist__item';
    item.classList.toggle('is-complete', task.complete);
    item.classList.toggle('is-active', task.status === 'active' || task.status === 'core');
    item.textContent = t(task.label);
    elements.checklist.append(item);
  });
}

function updatePrompt(prompt) {
  latestPrompt = prompt;
  elements.prompt.textContent = t(prompt);
}

function renderDebugCoordinates() {
  const position = session?.getAntWorldPosition();
  if (!position || !elements.debugCoordinateValues) return;
  const text = `x ${position.x.toFixed(3)}  y ${position.y.toFixed(3)}  z ${position.z.toFixed(3)}`;
  if (text === lastDebugCoordinateText) return;
  lastDebugCoordinateText = text;
  elements.debugCoordinateValues.textContent = text;
}

function stopDebugCoordinates() {
  window.clearInterval(debugCoordinateInterval);
  debugCoordinateInterval = null;
  lastDebugCoordinateText = '';
  if (elements.debugCoordinates) elements.debugCoordinates.hidden = true;
}

function syncDebugCoordinates() {
  const enabled = gameReady && (session?.isClimbDebugEnabled() ?? false);
  if (!enabled) {
    stopDebugCoordinates();
    return;
  }
  elements.debugCoordinates.hidden = false;
  renderDebugCoordinates();
  debugCoordinateInterval ??= window.setInterval(
    renderDebugCoordinates,
    DEBUG_COORDINATE_UPDATE_MS,
  );
}

let radioCaptionTimeout = null;
let radioCaptionIsCelebration = false;

function showRadioCaption(text, duration = 5, celebration = false) {
  if (!celebration && radioCaptionIsCelebration) return;
  window.clearTimeout(radioCaptionTimeout);
  elements.radioCaption.textContent = text;
  elements.radioCaption.hidden = !text;
  elements.radioCaption.classList.toggle('is-celebration', Boolean(celebration));
  radioCaptionIsCelebration = Boolean(celebration);
  radioCaptionTimeout = window.setTimeout(() => {
    elements.radioCaption.hidden = true;
    elements.radioCaption.classList.remove('is-celebration');
    radioCaptionIsCelebration = false;
  }, Math.max(1, Number(duration) || 5) * 1000);
}

function setPaused(nextPaused) {
  if (!session || !gameReady) return;
  paused = Boolean(nextPaused);
  clearGameInput();
  session.setPaused(paused);
  elements.pauseDialog.hidden = !paused;
  elements.pauseButton.textContent = t(paused ? 'ui.resume' : 'ui.pause');
  elements.pauseButton.setAttribute('aria-expanded', String(paused));
  document.body.classList.toggle('game-paused', paused);
  if (paused) requestAnimationFrame(() => elements.resumeButton.focus());
  if (!paused) requestAnimationFrame(() => session?.focusScene());
  if (paused) saveActiveSlot();
}

function togglePause() {
  setPaused(!paused);
}

function closeSettingsDialog() {
  elements.settingsDialog.hidden = true;
  elements.settingsButton.setAttribute('aria-expanded', 'false');
  const shouldResume = settingsPausedGame;
  settingsPausedGame = false;
  if (shouldResume) {
    setPaused(false);
    return;
  }
  if (paused) {
    elements.pauseDialog.hidden = false;
    requestAnimationFrame(() => elements.resumeButton.focus());
    return;
  }
  if (gameReady) requestAnimationFrame(() => session?.focusScene());
  else elements.settingsButton.focus();
}

function openSettingsDialog() {
  clearGameInput();
  settingsPausedGame = gameReady && !paused;
  if (settingsPausedGame) setPaused(true);
  elements.pauseDialog.hidden = true;
  elements.settingsDialog.hidden = false;
  elements.settingsButton.setAttribute('aria-expanded', 'true');
  elements.settingsCard.scrollTop = 0;
  requestAnimationFrame(() => elements.settingsTitle.focus({ preventScroll: true }));
}

function closeAboutDialog() {
  elements.aboutDialog.hidden = true;
  if (aboutPausedGame) setPaused(false);
  aboutPausedGame = false;
  if (gameReady && !paused) requestAnimationFrame(() => session?.focusScene());
  else if (paused) requestAnimationFrame(() => elements.resumeButton.focus());
  else elements.aboutShortcut.focus();
}

function openAboutDialog() {
  clearGameInput();
  aboutPausedGame = gameReady && !paused;
  if (aboutPausedGame) setPaused(true);
  elements.aboutDialog.hidden = false;
  elements.aboutCard.scrollTop = 0;
  requestAnimationFrame(() => elements.aboutTitle.focus({ preventScroll: true }));
}

function showStartupError(error) {
  console.error(error);
  elements.loading.hidden = true;
  elements.errorMessage.hidden = false;
  elements.errorMessage.querySelector('strong').textContent = t('ui.error.gameTitle');
  elements.errorMessage.querySelector('span').textContent = error.message
    || t('ui.error.fallback');
}

let loadingProgressValue = 0;

function updateLoadingProgress(value) {
  loadingProgressValue = Math.max(
    loadingProgressValue,
    Math.min(100, Math.round(Number(value) || 0)),
  );
  elements.loadingPercentage.textContent = `${loadingProgressValue}%`;
  elements.loadingBarFill.style.width = `${loadingProgressValue}%`;
  elements.loadingProgress.setAttribute('aria-valuenow', String(loadingProgressValue));
}

function updateExploreControl() {
  const exploreActive = session?.isExploreActive() ?? false;
  const debugRelocationActive = exploreActive && (session?.isClimbDebugEnabled() ?? false);
  elements.exploreButton.textContent = t(exploreActive ? 'ui.antView' : 'ui.explore');
  elements.exploreButton.setAttribute('aria-pressed', String(exploreActive));
  elements.antHint.hidden = exploreActive;
  elements.exploreHint.hidden = !exploreActive;
  elements.resetCameraButton.hidden = exploreActive;
  elements.touchHint.textContent = t(exploreActive ? 'hint.touchExplore' : 'hint.touchLook');
  elements.debugRelocateHint.hidden = !debugRelocationActive;
  elements.radioDebugHint.hidden = !(session?.canDebugControlRadio() ?? false);
  document.body.classList.toggle('debug-ant-relocate', debugRelocationActive);
  document.body.classList.toggle('game-explore-active', exploreActive);
  syncDebugCoordinates();
}

function setChecklistCollapsed(collapsed) {
  elements.checklistBody.hidden = collapsed;
  elements.checklistLabel.textContent = t('ui.checklist');
  elements.checklistToggle.setAttribute('aria-expanded', String(!collapsed));
  document.querySelector('.game-checklist')?.classList.toggle('is-collapsed', collapsed);
}

function toggleChecklist() {
  setChecklistCollapsed(!elements.checklistBody.hidden);
}

function setupDebugAntRelocation() {
  debugRelocateCleanup?.();
  const canvas = elements.scene.querySelector('canvas');
  if (!canvas) return;
  let activePointerId = null;

  const finish = (event = null) => {
    if (activePointerId === null) return;
    if (event && event.pointerId !== undefined && event.pointerId !== activePointerId) return;
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (canvas.hasPointerCapture?.(activePointerId)) {
      canvas.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    document.body.classList.remove('debug-ant-dragging');
  };
  const relocate = (event) => {
    if (!session?.canDebugRelocateAnt()) return false;
    return session.debugRelocateAnt(event.clientX, event.clientY);
  };
  const onPointerDown = (event) => {
    if (
      event.button !== 0
      || !event.shiftKey
      || !session?.canDebugRelocateAnt()
    ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activePointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    document.body.classList.add('debug-ant-dragging');
    relocate(event);
  };
  const onPointerMove = (event) => {
    if (event.pointerId !== activePointerId) return;
    if (!event.shiftKey || !session?.canDebugRelocateAnt()) {
      finish(event);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    relocate(event);
  };
  const onPointerEnd = (event) => finish(event);
  const onWindowBlur = () => finish();

  canvas.addEventListener('pointerdown', onPointerDown, true);
  canvas.addEventListener('pointermove', onPointerMove, true);
  canvas.addEventListener('pointerup', onPointerEnd, true);
  canvas.addEventListener('pointercancel', onPointerEnd, true);
  window.addEventListener('blur', onWindowBlur);
  debugRelocateCleanup = () => {
    finish();
    canvas.removeEventListener('pointerdown', onPointerDown, true);
    canvas.removeEventListener('pointermove', onPointerMove, true);
    canvas.removeEventListener('pointerup', onPointerEnd, true);
    canvas.removeEventListener('pointercancel', onPointerEnd, true);
    window.removeEventListener('blur', onWindowBlur);
    debugRelocateCleanup = null;
  };
}

function toggleExplore() {
  if (!session || paused) return;
  clearGameInput();
  if (!session.toggleExplore()) {
    updatePrompt('prompt.explore.finishClimb');
    return;
  }
  updateExploreControl();
  requestAnimationFrame(() => session?.focusScene());
}

// Touch input stays separate from keyboard input. The controller owns the radial deadzone.
function setupMobileGameControls() {
  mobileMovementCleanup?.();
  const joystick = elements.movementJoystick;
  const knob = elements.movementKnob;
  if (!joystick || !knob) return;

  let activePointerId = null;
  let runPointerId = null;
  let centerX = 0;
  let centerY = 0;
  let radius = 1;

  const reset = (event = null) => {
    if (event && event.pointerId !== activePointerId) return;
    const previousPointerId = activePointerId;
    activePointerId = null;
    session?.setMovementAxes(0, 0);
    joystick.classList.remove('is-held');
    knob.style.transform = 'translate(-50%, -50%)';
    if (previousPointerId !== null && joystick.hasPointerCapture?.(previousPointerId)) {
      joystick.releasePointerCapture(previousPointerId);
    }
  };

  const updateFromPointer = (event) => {
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const distance = Math.hypot(deltaX, deltaY);
    const scale = distance > radius ? radius / distance : 1;
    knob.style.transform = `translate(calc(-50% + ${deltaX * scale}px), calc(-50% + ${deltaY * scale}px))`;
    const horizontal = deltaX * scale / radius;
    const forward = -deltaY * scale / radius;
    session?.setMovementAxes(horizontal, forward);
  };

  const onPointerDown = (event) => {
    if (!canMoveAnt() || activePointerId !== null || event.button !== 0) return;
    event.preventDefault();
    const bounds = joystick.getBoundingClientRect();
    centerX = bounds.left + bounds.width / 2;
    centerY = bounds.top + bounds.height / 2;
    radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.34);
    activePointerId = event.pointerId;
    joystick.setPointerCapture?.(event.pointerId);
    joystick.classList.add('is-held');
    session?.unlockSound();
    updateFromPointer(event);
  };
  const onPointerMove = (event) => {
    if (event.pointerId !== activePointerId) return;
    if (!canMoveAnt()) {
      reset();
      return;
    }
    event.preventDefault();
    updateFromPointer(event);
  };
  const onClimb = () => {
    if (canMoveAnt() && session) {
      session.unlockSound();
      session.toggleClimb();
    }
  };

  const stopRunning = (event = null) => {
    if (event && event.pointerId !== runPointerId) return;
    const previousPointerId = runPointerId;
    runPointerId = null;
    touchRunHeld = false;
    syncRunning();
    if (previousPointerId !== null && elements.runButton.hasPointerCapture?.(previousPointerId)) {
      elements.runButton.releasePointerCapture(previousPointerId);
    }
  };
  const onRunPointerDown = (event) => {
    if (!canMoveAnt() || runPointerId !== null || event.button !== 0) return;
    event.preventDefault();
    runPointerId = event.pointerId;
    elements.runButton.setPointerCapture?.(runPointerId);
    session?.unlockSound();
    touchRunHeld = true;
    syncRunning();
  };

  joystick.addEventListener('pointerdown', onPointerDown);
  joystick.addEventListener('pointermove', onPointerMove);
  joystick.addEventListener('pointerup', reset);
  joystick.addEventListener('pointercancel', reset);
  joystick.addEventListener('lostpointercapture', reset);
  elements.climbButton?.addEventListener('click', onClimb);
  elements.runButton?.addEventListener('pointerdown', onRunPointerDown);
  elements.runButton?.addEventListener('pointerup', stopRunning);
  elements.runButton?.addEventListener('pointercancel', stopRunning);
  elements.runButton?.addEventListener('lostpointercapture', stopRunning);
  resetMobileControls = () => {
    reset();
    stopRunning();
  };

  mobileMovementCleanup = () => {
    resetMobileControls();
    joystick.removeEventListener('pointerdown', onPointerDown);
    joystick.removeEventListener('pointermove', onPointerMove);
    joystick.removeEventListener('pointerup', reset);
    joystick.removeEventListener('pointercancel', reset);
    joystick.removeEventListener('lostpointercapture', reset);
    elements.climbButton?.removeEventListener('click', onClimb);
    elements.runButton?.removeEventListener('pointerdown', onRunPointerDown);
    elements.runButton?.removeEventListener('pointerup', stopRunning);
    elements.runButton?.removeEventListener('pointercancel', stopRunning);
    elements.runButton?.removeEventListener('lostpointercapture', stopRunning);
    resetMobileControls = null;
    mobileMovementCleanup = null;
  };
}

window.addEventListener('keydown', (event) => {
  if (!elements.aboutDialog.hidden) {
    if (event.code === 'Escape') {
      event.preventDefault();
      closeAboutDialog();
    }
    return;
  }
  if (!elements.settingsDialog.hidden) {
    if (event.code === 'Escape') {
      event.preventDefault();
      closeSettingsDialog();
    }
    return;
  }
  const pauseKey = event.code === 'Escape' || event.code === 'KeyP';
  if (pauseKey && !event.repeat && (paused || !isEditableTarget(event.target))) {
    event.preventDefault();
    togglePause();
    return;
  }
  if (isEditableTarget(event.target)) return;
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    if (canMoveAnt() && !event.repeat) heldRunCodes.add(event.code);
    syncRunning();
    return;
  }
  if (event.code === 'KeyM' && !event.repeat) {
    event.preventDefault();
    toggleExplore();
    return;
  }
  if (event.code === 'KeyC' && !event.repeat) {
    event.preventDefault();
    resetCameraView();
    return;
  }
  if (event.code === 'Space') {
    if (session?.isExploreActive()) return;
    event.preventDefault();
    if (canMoveAnt() && !event.repeat) {
      if (session?.isFlightEnabled()) {
        heldFlightCodes.add(event.code);
        session.setMovementKey('up', true);
      } else session?.toggleClimb();
    }
    return;
  }
  if (event.code === 'KeyG' && !event.repeat) {
    event.preventDefault();
    if (session?.isClimbDebugAvailable()) session.toggleClimbDebug();
    updateExploreControl();
    return;
  }
  if (event.code === 'KeyY' && !event.repeat) {
    event.preventDefault();
    if (session?.isClimbDebugEnabled()) {
      const enabled = session.toggleFlight();
      updatePrompt(enabled
        ? 'debug.flight.enabled'
        : 'debug.flight.disabled');
    }
    return;
  }
  if (event.code === 'KeyR' && !event.repeat) {
    if (!session?.canDebugControlRadio()) return;
    event.preventDefault();
    showRadioCaption(t('debug.radio.music', { mode: session.cycleDebugRadioMusic() }), 3);
    return;
  }
  if (event.code === 'KeyV' && !event.repeat) {
    if (!session?.canDebugControlRadio()) return;
    event.preventDefault();
    showRadioCaption(t('debug.radio.voice', {
      result: session.playDebugRadioAnnouncement(),
    }), 3);
    return;
  }
  if (event.code === 'KeyT' && !event.repeat && session?.canDebugControlWeather()) {
    event.preventDefault();
    const phase = session.toggleDebugRain();
    showRadioCaption(t('debug.weather', { phase }), 3);
    return;
  }
  if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && session?.isFlightEnabled()) {
    event.preventDefault();
    if (canMoveAnt() && !event.repeat) {
      heldFlightCodes.add(event.code);
      session.setMovementKey('down', true);
    }
    return;
  }
  const direction = antMovementKeys.get(event.code);
  if (direction) {
    if (session?.isExploreActive()) return;
    event.preventDefault();
    if (canMoveAnt() && !event.repeat) {
      session?.unlockSound();
      heldMovementCodes.add(event.code);
      syncMovementDirection(direction);
    }
    return;
  }
  if (event.repeat) return;
  if (event.code === 'KeyF') {
    event.preventDefault();
    session?.toggleFullscreen();
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    heldRunCodes.delete(event.code);
    syncRunning();
    return;
  }
  if (heldFlightCodes.delete(event.code)) {
    event.preventDefault();
    const downHeld = heldFlightCodes.has('ControlLeft') || heldFlightCodes.has('ControlRight');
    session?.setMovementKey('up', heldFlightCodes.has('Space'));
    session?.setMovementKey('down', downHeld);
    return;
  }
  const direction = antMovementKeys.get(event.code);
  if (!direction || !heldMovementCodes.delete(event.code)) return;
  event.preventDefault();
  syncMovementDirection(direction);
});

window.addEventListener('blur', clearGameInput);
window.addEventListener('resize', () => resetMobileControls?.());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearGameInput();
  if (document.hidden) fpsSampler.reset();
  if (document.hidden && gameReady && session && !paused) setPaused(true);
});

elements.pauseButton.addEventListener('click', togglePause);
elements.settingsButton.addEventListener('click', openSettingsDialog);
elements.closeSettingsButton.addEventListener('click', closeSettingsDialog);
elements.aboutShortcut.addEventListener('click', openAboutDialog);
elements.closeAboutButton.addEventListener('click', closeAboutDialog);
elements.resumeButton.addEventListener('click', () => setPaused(false));
elements.exploreButton.addEventListener('click', toggleExplore);
elements.resetCameraButton.addEventListener('click', resetCameraView);
elements.fullscreenButton.addEventListener('click', () => {
  session?.toggleFullscreen();
  requestAnimationFrame(() => session?.focusScene());
});
elements.restartButton.addEventListener('click', () => {
  saveActiveSlot();
  window.location.reload();
});
elements.newGameButton.addEventListener('click', () => startNewGame());
elements.soundEnabled.addEventListener('change', () => {
  soundEffectsEnabled = elements.soundEnabled.checked;
  try {
    window.localStorage.setItem(SOUND_EFFECTS_KEY, soundEffectsEnabled ? '1' : '0');
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store the chime preference.', error);
  }
  if (soundEffectsEnabled) session?.unlockSound();
  session?.setSoundEnabled(soundEffectsEnabled);
});
elements.musicVolume.addEventListener('input', () => updateMusicVolume(elements.musicVolume.value));
elements.performanceDiagnosticEnabled.addEventListener('change', () => {
  setPerformanceDiagnosticEnabled(elements.performanceDiagnosticEnabled.checked, true);
});
elements.checklistToggle.addEventListener('click', toggleChecklist);
elements.checklistPanel.addEventListener('click', (event) => {
  if (event.target.closest('.game-checklist__toggle')) return;
  toggleChecklist();
});
elements.qualitySelect.value = requestedQualityProfile() ?? storedQualityPreference();
elements.applyQualityButton.addEventListener('click', () => {
  elements.qualityError.hidden = true;
  if (!saveActiveSlot()) {
    elements.qualityError.hidden = false;
    return;
  }
  const preference = elements.qualitySelect.value;
  const selectedSeason = elements.seasonSelect.value;
  if (!Object.hasOwn(SEASONS, selectedSeason)) {
    elements.qualityError.hidden = false;
    return;
  }
  try {
    window.localStorage.setItem(QUALITY_STORAGE_KEY, preference);
    window.localStorage.setItem(SEASON_KEY, selectedSeason);
  } catch {
    elements.qualityError.hidden = false;
    return;
  }
  const url = new URL(window.location.href);
  // Replace any URL override so the new selection also applies to this load.
  if (preference === 'auto') url.searchParams.delete('q');
  else url.searchParams.set('q', preference);
  window.location.assign(url.href);
});

elements.languageSelect.addEventListener('change', () => {
  language = elements.languageSelect.value === 'id' ? 'id' : 'en';
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store language preference.', error);
  }
  applyLanguage();
});

async function startGame() {
  try {
    session = new PondGameSession(elements.scene, {
      onStateChange: updateGameState,
      onPromptChange: updatePrompt,
      onRadioCaption: showRadioCaption,
      onTimeChange: updateGameTime,
      onLoadProgress: updateLoadingProgress,
      language,
      season,
      soundEnabled: soundEffectsEnabled,
      musicVolume,
      saveState: saveSlots[activeSaveSlotIndex]?.state ?? null,
    });
    await session.start();
    syncPerformanceDiagnosticSubscription();
    setChecklistCollapsed(true);
    gameReady = true;
    elements.debugKeyHint.hidden = !session.isClimbDebugAvailable();
    setupDebugAntRelocation();
    setupMobileGameControls();
    updateExploreControl();
    saveActiveSlot();
    renderSaveSlots();
    updateLoadingProgress(100);
    window.setTimeout(() => { elements.loading.hidden = true; }, 180);
  } catch (error) {
    performanceDiagnosticUnsubscribe?.();
    performanceDiagnosticUnsubscribe = null;
    session?.dispose();
    session = null;
    showStartupError(error);
  }
}

window.addEventListener('beforeunload', () => {
  saveActiveSlot();
  window.clearTimeout(saveTimeout);
  stopDebugCoordinates();
  performanceDiagnosticUnsubscribe?.();
  performanceDiagnosticUnsubscribe = null;
  debugRelocateCleanup?.();
  mobileMovementCleanup?.();
  session?.dispose();
});

registerGameServiceWorker();
setPerformanceDiagnosticEnabled(performanceDiagnosticEnabled);
startGame();
applyLanguage();
