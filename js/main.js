import { renderUndergroundMap, createMapViewport, applySurfaceMap, setMapLabelsVisible } from './ui/underground-map.js';
import { createDebugControls } from './ui/debug-controls.js';
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
import { shouldTouchRun } from './utils/player-motion.js';

import { createGameplayLayout } from './ui/gameplay-layout.js';
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
  radioControlButton: byId('radio-control-button'),
  radioControlDialog: byId('radio-control-dialog'),
  radioControlTitle: byId('radio-control-title'),
  radioKnob: byId('radio-knob'),
  radioKnobInput: byId('radio-knob-input'),
  radioKnobValue: byId('radio-knob-value'),
  sleepButton: byId('sleep-button'),
  sleepDialog: byId('sleep-dialog'),
  sleepTitle: byId('sleep-title'),
  sleepFade: byId('sleep-fade'),
  materialStore: byId('material-store'),
  buildingActions: byId('building-actions'),
  buildingButtons: byId('building-buttons'),
  buildingStatus: byId('building-status'),
  undergroundMap: byId('underground-map'),
  undergroundMapContent: byId('underground-map-content'),
  undergroundMapClose: byId('underground-map-close'),
  undergroundMapLabels: byId('underground-map-labels'),
  burrowButton: byId('burrow-button'),
  burrowFade: byId('burrow-fade'),
  objective: byId('game-objective-title'),
  prompt: byId('game-prompt'),
  step: byId('game-step'),
  progress: document.querySelector('.game-progress'),
  progressFill: byId('game-progress-fill'),
  pauseButton: byId('pause-button'),
  settingsButton: byId('settings-button'),
  exploreButton: byId('explore-button'),
  birdSwitchButton: byId('bird-switch-button'),
  birdSwitchLabel: document.querySelector('#bird-switch-button .bird-switch__label'),
  birdSwitchShort: document.querySelector('#bird-switch-button .bird-switch__short'),
  resetCameraButton: byId('reset-camera-button'),
  aboutShortcut: byId('about-shortcut'),
  aboutDialog: byId('about-dialog'),
  aboutCard: byId('about-card'),
  aboutShareButton: byId('about-share-button'),
  aboutShareLink: byId('about-share-link'),
  aboutShareStatus: byId('about-share-status'),
  aboutTitle: byId('about-title'),
  closeAboutButton: byId('close-about-button'),
  gameVersion: byId('game-version'),
  antHint: byId('ant-hint'),
  undergroundHint: byId('underground-hint'),
  birdHint: byId('bird-hint'),
  exploreReturnLabel: byId('explore-return-label'),
  exploreHint: byId('explore-hint'),
  touchHint: byId('touch-hint'),
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
  antTrailsEnabled: byId('ant-trails-enabled'),
  antVisibilityEnabled: byId('ant-visibility-enabled'),
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
  cardsButton: byId('cards-button'),
  cardsDialog: byId('cards-dialog'),
  cardsTitle: byId('cards-title'),
  cardsClose: byId('cards-close'),
  cardsGrid: byId('cards-grid'),
  cardsDetail: byId('cards-detail'),
  cardsCount: byId('cards-count'),
  cardNotice: byId('card-notice'),
  checklist: byId('game-checklist-list'),
  checklistPanel: document.querySelector('.game-checklist'),
  checklistToggle: byId('checklist-toggle'),
  checklistLabel: document.querySelector('#checklist-toggle span'),
  checklistBody: byId('checklist-body'),
  languageSelect: byId('language-select'),
  movementJoystick: byId('movement-joystick'),
  movementKnob: byId('movement-knob'),
  climbButton: byId('climb-button'),
};

const mapViewport = createMapViewport(elements.undergroundMapContent);

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

const gameplayLayout = createGameplayLayout({ caption: elements.radioCaption, dock: document.querySelector('.context-actions'), hint: elements.touchHint });
let session = null;
let paused = false;
let gameReady = false;
let sleepTransition = false;
let burrowTransition = false;
const LANGUAGE_KEY = 'the-quiet-pond-language';
const SEASON_KEY = 'the-quiet-pond-season';
const PERFORMANCE_DIAGNOSTIC_KEY = 'the-quiet-pond-performance-diagnostic';
const ANT_VISIBILITY_KEY = 'the-quiet-pond-ant-visibility';
const ANT_TRAILS_KEY = 'the-quiet-pond-ant-trails';
const SOUND_EFFECTS_KEY = 'the-quiet-pond-soft-chimes';
const MUSIC_VOLUME_KEY = 'the-quiet-pond-music-volume';
const SAVE_SLOTS_KEY = 'the-quiet-pond-saves-v1';
const ACTIVE_SAVE_SLOT_KEY = 'the-quiet-pond-active-save-slot-v1';
let language = readStoredValue(LANGUAGE_KEY) === 'id' ? 'id' : 'en';
let season = readSeasonPreference();
let antVisibilityEnabled = readStoredValue(ANT_VISIBILITY_KEY) === '1';
let antTrailsEnabled = readStoredValue(ANT_TRAILS_KEY) === '1';
let soundEffectsEnabled = readStoredValue(SOUND_EFFECTS_KEY) !== '0';
let musicVolume = readMusicVolumePreference();
const initialSeedTotal = Math.max(1, Number(POND_GAME.seed.totalCount) || 1);
elements.progress.setAttribute('aria-valuemax', String(initialSeedTotal));
elements.step.textContent = formatSeedProgress(0, initialSeedTotal, language);
elements.soundEnabled.checked = soundEffectsEnabled;
elements.antTrailsEnabled.checked = antTrailsEnabled;
elements.antVisibilityEnabled.checked = antVisibilityEnabled;
elements.seasonSelect.value = season;
elements.musicVolume.value = String(Math.round(musicVolume * 100));
elements.musicVolumeValue.value = `${Math.round(musicVolume * 100)}%`;
elements.musicVolumeValue.textContent = `${Math.round(musicVolume * 100)}%`;
let performanceDiagnosticEnabled = readStoredValue(PERFORMANCE_DIAGNOSTIC_KEY) === '1';
let latestSnapshot = null;
let knownCompletedCards = null;
let selectedCardId = null;
let noticeCardId = null;
let cardNoticeTimeout = null;
let cardsPausedGame = false;
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
const debugControls = createDebugControls({
  getSession: () => session,
  getGameHour: () => latestGameHour,
  translate: t,
  onToggle: () => {
    renderChecklist(latestSnapshot?.checklist);
    updateExploreControl();
  },
  updatePrompt,
  showRadioCaption,
});
let performanceDiagnosticUnsubscribe = null;
const fpsSampler = new FpsSampler({
  sampleSeconds: PERFORMANCE_DIAGNOSTIC.sampleSeconds,
  warningFps: PERFORMANCE_DIAGNOSTIC.warningFps[QUALITY_PROFILE_NAME],
  recoveryMargin: PERFORMANCE_DIAGNOSTIC.recoveryMargin,
});

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
  elements.musicVolume.value = String(percentage);
  elements.radioKnobInput.value = String(percentage);
  elements.radioKnob.style.setProperty('--knob-angle', `${-135 + percentage * 2.7}deg`);
  elements.radioKnobValue.textContent = `${percentage}%`;
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
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
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
    && !sleepTransition
    && !burrowTransition
    && elements.sleepDialog.hidden
    && elements.settingsDialog.hidden
    && elements.aboutDialog.hidden
    && !session?.isExploreActive();
}

function syncRunning() {
  const running = canMoveAnt() && (touchRunHeld || heldRunCodes.size > 0);
  session?.setAntRunning(running);
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
  updateCards(snapshot.checklist);
  updateExploreControl();
  requestAutosave();
}

function renderChecklist(checklist) {
  if (!elements.checklist || !checklist?.tasks) return;
  elements.checklist.replaceChildren();
  checklist.tasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'game-checklist__item';
    item.classList.toggle('is-complete', task.complete);
    debugControls.appendChecklistControl(item, task);
    const copy = document.createElement('span');
    copy.className = 'game-checklist__copy';
    const label = document.createElement('span');
    label.textContent = t(task.label);
    copy.append(label);
    if (task.hint && !task.complete) {
      const hint = document.createElement('small');
      hint.className = 'game-checklist__hint';
      hint.textContent = t(task.hint);
      copy.append(hint);
    }
    item.append(copy);
    elements.checklist.append(item);
  });
}

function updateCards(checklist) {
  if (!checklist?.tasks) return;
  const completed = new Set(checklist.tasks.filter((task) => task.complete).map((task) => task.id));
  if (knownCompletedCards && gameReady) {
    const unlocked = checklist.tasks.filter((task) => task.complete && !knownCompletedCards.has(task.id));
    if (unlocked.length) showCardNotice(unlocked[unlocked.length - 1].id);
  }
  knownCompletedCards = completed;
  if (!elements.cardsDialog.hidden) renderCards();
}

function showCardNotice(id) {
  noticeCardId = id;
  const image = document.createElement('img');
  image.src = `./assets/images/discovery-cards/${id}.png`;
  image.alt = '';
  const text = document.createElement('span');
  text.textContent = t('cards.notice', { name: t(`cards.${id}.title`) });
  elements.cardNotice.replaceChildren(image, text);
  elements.cardNotice.hidden = false;
  window.clearTimeout(cardNoticeTimeout);
  cardNoticeTimeout = window.setTimeout(() => { elements.cardNotice.hidden = true; }, 6000);
}

function renderCards() {
  const tasks = latestSnapshot?.checklist?.tasks ?? [];
  const completed = new Set(tasks.filter((task) => task.complete).map((task) => task.id));
  elements.cardsCount.textContent = t('cards.count', { count: completed.size, total: GAME_OBJECTIVES.length });
  elements.cardsGrid.replaceChildren();
  elements.cardsDetail.replaceChildren();
  const selected = GAME_OBJECTIVES.find((objective) => objective.id === selectedCardId && completed.has(objective.id));
  elements.cardsDialog.classList.toggle('is-detail', Boolean(selected));
  elements.cardsGrid.hidden = Boolean(selected);
  elements.cardsDetail.hidden = !selected;
  if (selected) {
    const back = document.createElement('button');
    back.className = 'cards-back';
    back.textContent = t('cards.back');
    back.addEventListener('click', () => { selectedCardId = null; renderCards(); elements.cardsTitle.focus(); });
    const card = document.createElement('article');
    card.className = 'discovery-card discovery-card--detail';
    card.addEventListener('click', (event) => {
      const bounds = card.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      card.style.setProperty('--card-tilt-x', `${-y * 9}deg`);
      card.style.setProperty('--card-tilt-y', `${x * 9}deg`);
      card.style.setProperty('--card-rebound-x', `${y * 3.15}deg`);
      card.style.setProperty('--card-rebound-y', `${-x * 3.15}deg`);
      card.style.setProperty('--card-settle-x', `${-y * 1.08}deg`);
      card.style.setProperty('--card-settle-y', `${x * 1.08}deg`);
      card.classList.remove('is-jiggling');
      void card.offsetWidth;
      card.classList.add('is-jiggling');
    });
    const title = document.createElement('h3');
    title.textContent = t(`cards.${selected.id}.title`);
    const image = document.createElement('img');
    image.src = `./assets/images/discovery-cards/${selected.id}.png`;
    image.alt = '';
    const description = document.createElement('p');
    description.textContent = t(`cards.${selected.id}.description`);
    const label = document.createElement('small');
    label.textContent = t('cards.discovered');
    const footer = document.createElement('div');
    footer.className = 'discovery-card__footer';
    const conditionLabel = document.createElement('span');
    conditionLabel.className = 'discovery-card__condition-label';
    conditionLabel.textContent = t('cards.discoveredBy');
    const condition = document.createElement('span');
    condition.className = 'discovery-card__condition';
    condition.textContent = t(selected.id === 'seeds' ? 'cards.seeds.condition' : selected.labelKey);
    const number = document.createElement('span');
    number.className = 'discovery-card__number';
    number.textContent = `✦  ${String(GAME_OBJECTIVES.indexOf(selected) + 1).padStart(2, '0')} / ${String(GAME_OBJECTIVES.length).padStart(2, '0')}`;
    footer.append(conditionLabel, condition, number);
    card.append(label, title, image, description, footer);
    const stage = document.createElement('div');
    stage.className = 'discovery-card-stage';
    const flip = document.createElement('div');
    flip.className = 'discovery-card-flip';
    const cardBack = document.createElement('div');
    cardBack.className = 'discovery-card discovery-card__back';
    cardBack.setAttribute('aria-hidden', 'true');
    cardBack.textContent = '✦';
    flip.append(card, cardBack);
    stage.append(flip);
    const carousel = document.createElement('div');
    carousel.className = 'cards-carousel';
    const unlockedCards = GAME_OBJECTIVES.filter((objective) => completed.has(objective.id));
    if (unlockedCards.length > 1) {
      const selectedIndex = unlockedCards.indexOf(selected);
      const makeNavigation = (direction, message) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cards-navigation';
        button.setAttribute('aria-label', t(message));
        button.classList.add(direction < 0 ? 'cards-navigation--previous' : 'cards-navigation--next');
        button.addEventListener('click', () => {
          selectedCardId = unlockedCards[(selectedIndex + direction + unlockedCards.length) % unlockedCards.length].id;
          session?.playCardReveal();
          renderCards();
          elements.cardsDetail.querySelectorAll('.cards-navigation')[direction < 0 ? 0 : 1]?.focus();
        });
        return button;
      };
      carousel.append(makeNavigation(-1, 'cards.previous'), stage, makeNavigation(1, 'cards.next'));
    } else {
      carousel.append(stage);
    }
    elements.cardsDetail.append(back, carousel);
    return;
  }
  GAME_OBJECTIVES.forEach((objective, index) => {
    const unlocked = completed.has(objective.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `discovery-card discovery-card--tile${unlocked ? '' : ' is-locked'}`;
    card.disabled = !unlocked;
    const number = document.createElement('small');
    number.textContent = String(index + 1).padStart(2, '0');
    const image = document.createElement('span');
    image.className = 'discovery-card__image';
    if (unlocked) {
      const picture = document.createElement('img');
      picture.src = `./assets/images/discovery-cards/${objective.id}.png`;
      picture.alt = '';
      picture.loading = 'lazy';
      image.append(picture);
    } else image.textContent = '?';
    const title = document.createElement('strong');
    title.textContent = unlocked ? t(`cards.${objective.id}.title`) : t('cards.locked');
    card.append(number, image, title);
    if (unlocked) card.addEventListener('click', () => { selectedCardId = objective.id; session?.playCardReveal(); renderCards(); elements.cardsDetail.querySelector('button').focus(); });
    elements.cardsGrid.append(card);
  });
}

function openCards(id = null) {
  if (!gameReady || !elements.settingsDialog.hidden || !elements.aboutDialog.hidden) return;
  cardsPausedGame = !paused;
  if (cardsPausedGame) setPaused(true);
  elements.pauseDialog.hidden = true;
  elements.cardNotice.hidden = true;
  window.clearTimeout(cardNoticeTimeout);
  selectedCardId = id;
  if (id) session?.playCardReveal();
  elements.cardsDialog.hidden = false;
  elements.cardsButton.setAttribute('aria-expanded', 'true');
  renderCards();
  requestAnimationFrame(() => elements.cardsTitle.focus({ preventScroll: true }));
}

function closeCards() {
  elements.cardsDialog.hidden = true;
  elements.cardsButton.setAttribute('aria-expanded', 'false');
  if (cardsPausedGame) setPaused(false);
  else if (paused) { elements.pauseDialog.hidden = false; requestAnimationFrame(() => elements.resumeButton.focus()); }
  cardsPausedGame = false;
}

function updateRadioControlButton() {
  elements.radioControlButton.hidden = !(canMoveAnt() && elements.cardsDialog.hidden && session?.canAdjustRadio());
}

function openRadioControl() {
  if (!canMoveAnt() || !session?.canAdjustRadio()) return;
  setPaused(true);
  elements.pauseDialog.hidden = true;
  elements.radioControlButton.hidden = true;
  elements.radioControlDialog.hidden = false;
  updateMusicVolume(musicVolume * 100, false);
  requestAnimationFrame(() => elements.radioKnobInput.focus({ preventScroll: true }));
}

function closeRadioControl() {
  elements.radioControlDialog.hidden = true;
  setPaused(false);
  updateRadioControlButton();
}

function setRadioKnobFromPointer(event) {
  const bounds = elements.radioKnob.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  if (Math.hypot(dx, dy) < bounds.width * 0.08) return;
  const angle = ((Math.atan2(dx, -dy) * 180 / Math.PI - 225) % 360 + 360) % 360;
  const value = angle <= 270 ? angle / 270 * 100 : angle < 315 ? 100 : 0;
  updateMusicVolume(Math.round(value));
}

function updateSleepButton() {
  const available = canMoveAnt() && elements.cardsDialog.hidden && session?.canSleep();
  elements.sleepButton.hidden = !available;
}

let buildingUiElapsed = 0.2;
let buildingUiSignature = '';
const buildingTouchMedia = window.matchMedia('(any-pointer: coarse)');
const compactBuildingStatuses = new Set(['building.carrySeed', 'building.carryLeaf', 'building.carryStick', 'building.preview', 'building.needLeaves', 'building.needMaterials']);
let buildingNoticeTimer = null;
let lastBuildingNotice = '';
let lastBuildingNoticeTime = -Infinity;
function notifyBuildingStatus(status, active) {
  if (!active) { elements.buildingStatus.hidden = true; return; }
  if (!status || status === lastBuildingNotice) return;
  const now = performance.now();
  if (now - lastBuildingNoticeTime < 3500 || !elements.cardNotice.hidden) return;
  lastBuildingNotice = status; lastBuildingNoticeTime = now;
  const headerBottom = elements.checklistToggle.getBoundingClientRect().bottom;
  elements.buildingStatus.style.top = `${Math.min(headerBottom + 8, window.innerHeight * 0.5)}px`;
  elements.buildingStatus.textContent = t(status); elements.buildingStatus.hidden = false;
  window.clearTimeout(buildingNoticeTimer);
  buildingNoticeTimer = window.setTimeout(() => { elements.buildingStatus.hidden = true; }, 3000);
}
function updateBuildingControls({ delta = 0.2 } = {}) {
  buildingUiElapsed += delta;
  if (buildingUiElapsed < 0.12) return;
  buildingUiElapsed = 0;
  const actions = canMoveAnt() ? session?.getBuildingActions() ?? [] : [];
  const fullStatus = actions[0]?.reason ?? session?.getBuildingStatus() ?? '';
  const status = buildingTouchMedia.matches && compactBuildingStatuses.has(fullStatus) ? `${fullStatus}.touch` : fullStatus;
  const signature = JSON.stringify([actions, status, language]);
  if (signature === buildingUiSignature) return;
  buildingUiSignature = signature;
  elements.buildingActions.hidden = !actions.length;
  notifyBuildingStatus(status, actions.length > 0);
  elements.buildingButtons.replaceChildren();
  actions.forEach((action, index) => {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = t(action.label); button.disabled = Boolean(action.disabled);
    button.dataset.primary = String(index === 0);
    if (action.reason) button.title = t(action.reason);
    button.addEventListener('click', () => performBuildingAction(action.id));
    elements.buildingButtons.append(button);
  });
}
function performBuildingAction(id) {
  if (!canMoveAnt()) return;
  const result = session?.performBuildingAction(id);
  if (result === 'sleep') { openSleep(); return; }
  if (result === 'storage') {
    setPaused(true); elements.pauseDialog.hidden = true;
    renderMaterialStore();
    elements.materialStore.showModal();
  } else {
    if (result) saveActiveSlot();
    buildingUiSignature = ''; updateBuildingControls();
    session?.focusScene();
  }
}
function fillFutureMaterialSlots(container, count) {
  for (let index = count; index < 6; index++) {
    const slot = document.createElement('div'); slot.className = 'material-empty-slot';
    const mark = document.createElement('span'); mark.textContent = '···'; mark.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.textContent = t('building.comingSoon');
    slot.append(mark,label); container.append(slot);
  }
}
function renderMaterialStore() {
  const storage = session.getMaterialStorage();
  const slots = byId('material-store-slots'); slots.replaceChildren();
  for (const material of storage.materials) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'material-slot';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox','0 0 64 64'); icon.setAttribute('aria-hidden','true');
    icon.classList.add('material-slot-icon');
    for (const shape of material.iconPaths ?? ['M12 32L32 12L52 32L32 52Z']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',shape); icon.append(path);
    }
    const label = document.createElement('span'); label.textContent = t(material.labelKey);
    const count = document.createElement('span'); count.className = 'material-slot-count'; count.textContent = String(material.count);
    card.disabled = material.count === 0;
    card.setAttribute('aria-label',t('building.withdrawMaterial',{material:t(material.labelKey),count:material.count}));
    card.title = t('building.withdrawHint');
    card.addEventListener('click',()=>{ if(session.takeStoredMaterial(material.id)) { saveActiveSlot(); closeMaterialStore(); } });
    card.append(icon,label,count); slots.append(card);
  }
  fillFutureMaterialSlots(slots, storage.materials.length);
  const recipes = byId('material-store-recipes'); recipes.replaceChildren();
  for(const recipe of storage.recipes) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'material-recipe';
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 96 96'); icon.setAttribute('aria-hidden','true');
    icon.classList.add('material-recipe-icon');
    for (const shape of recipe.iconShapes ?? []) {
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',shape.path); path.setAttribute('fill',shape.fill); path.setAttribute('stroke',shape.stroke);
      icon.append(path);
    }
    const label = document.createElement('span'); label.className = 'material-recipe-name';
    label.textContent = t(recipe.nameKey ?? recipe.labelKey);
    const cost = document.createElement('span'); cost.className = 'material-recipe-cost';
    const costText = Object.entries(recipe.cost).map(([type,amount])=>`${amount} ${t(storage.materials.find((material)=>material.id===type)?.labelKey ?? type)}`).join(' + ');
    cost.textContent = costText;
    card.disabled = !recipe.canBuild;
    card.setAttribute('aria-label',`${t(recipe.labelKey)}. ${cost.textContent}`);
    card.title = recipe.canBuild ? t(recipe.labelKey) : t('building.needMaterials');
    card.addEventListener('click',()=>{ if(session.planBuild(recipe.id)) closeMaterialStore(); else renderMaterialStore(); });
    card.append(icon,label,cost); recipes.append(card);
  }
  fillFutureMaterialSlots(recipes, storage.recipes.length);
}
function closeMaterialStore() {
  elements.materialStore.close(); setPaused(false);
  buildingUiSignature = ''; updateBuildingControls();
}

function updateBurrowButton() {
  elements.burrowButton.hidden = !canMoveAnt() || !elements.cardsDialog.hidden || !session?.canUseBurrow();
  elements.burrowButton.textContent = t(session?.isUnderground() ? 'underground.exit' : 'underground.enter');
}

async function useBurrow() {
  if (!canMoveAnt() || !session?.canUseBurrow() || burrowTransition) return;
  const entering = !session.isUnderground();
  burrowTransition = true;
  setPaused(true);
  elements.pauseDialog.hidden = true;
  elements.burrowButton.hidden = true;
  elements.burrowFade.hidden = false;
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const fadeMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 900;
  const loadingLabel = elements.loading.querySelector('[data-i18n="ui.loading"]');
  let failed = false;
  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    elements.burrowFade.classList.add('is-dark');
    await wait(fadeMs);
    if (entering) {
      if (!session.underground) {
        loadingProgressValue = 0;
        updateLoadingProgress(0);
        loadingLabel.textContent = t('underground.loading');
        elements.loading.classList.add('is-burrow-loading');
        elements.loading.hidden = false;
        await new Promise(requestAnimationFrame);
        await session.prepareUnderground(updateLoadingProgress);
      }
    }
    session.setUndergroundActive(entering);
    if (entering && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: 'cache-underground' });
      }).catch(() => {});
    }
    saveActiveSlot();
  } catch (error) {
    failed = true;
    console.warn('[the-quiet-pond] Could not enter the burrow.', error);
  } finally {
    elements.loading.hidden = true;
    elements.loading.classList.remove('is-burrow-loading');
    loadingLabel.textContent = t('ui.loading');
    elements.burrowFade.classList.remove('is-dark');
    await wait(fadeMs);
    elements.burrowFade.hidden = true;
    burrowTransition = false;
    setPaused(false);
    updateExploreControl();
    updateBurrowButton();
    if (failed) showRadioCaption(t('underground.loadFailed'), 9);
  }
}

function openSleep() {
  if (!canMoveAnt() || !session?.canSleep()) return;
  setPaused(true);
  elements.pauseDialog.hidden = true;
  elements.sleepButton.hidden = true;
  elements.sleepDialog.hidden = false;
  requestAnimationFrame(() => elements.sleepTitle.focus({ preventScroll: true }));
}

function closeSleep() {
  elements.sleepDialog.hidden = true;
  setPaused(false);
  updateSleepButton();
}

function beginSleep(choice) {
  if (sleepTransition || elements.sleepDialog.hidden) return;
  sleepTransition = true;
  elements.sleepDialog.hidden = true;
  elements.sleepFade.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => elements.sleepFade.classList.add('is-dark')));
  window.setTimeout(() => {
    session?.sleepUntil(choice);
    saveActiveSlot();
    window.setTimeout(() => {
      elements.sleepFade.classList.remove('is-dark');
      window.setTimeout(() => {
        elements.sleepFade.hidden = true;
        sleepTransition = false;
        setPaused(false);
        updateSleepButton();
      }, 900);
    }, 300);
  }, 900);
}

function updatePrompt(prompt) {
  latestPrompt = prompt;
  elements.prompt.textContent = t(prompt);
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
  if ((burrowTransition || sleepTransition) && !nextPaused) return;
  paused = Boolean(nextPaused);
  if (paused) { elements.sleepButton.hidden = true; elements.burrowButton.hidden = true; elements.radioControlButton.hidden = true; }
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
  const birdActive = session?.isBirdActive() ?? false;
  const birdPreparing = session?.isBirdPreparing() ?? false;
  const undergroundActive = session?.isUnderground() ?? false;
  const returnLabel = birdActive ? 'ui.birdView' : 'ui.antView';
  elements.exploreButton.textContent = t(exploreActive ? returnLabel : undergroundActive ? 'underground.map.button' : 'ui.explore');
  elements.exploreButton.setAttribute('aria-pressed', String(exploreActive));
  elements.exploreButton.setAttribute('aria-haspopup', undergroundActive ? 'dialog' : 'false');
  elements.exploreReturnLabel.textContent = t(returnLabel);
  elements.antHint.hidden = exploreActive || birdActive || undergroundActive;
  elements.undergroundHint.hidden = !undergroundActive;
  if (elements.climbButton) elements.climbButton.hidden = undergroundActive;
  elements.birdHint.hidden = exploreActive || !birdActive;
  elements.birdSwitchButton.hidden = !(session?.canPlayBird() ?? false);
  elements.birdSwitchButton.disabled = birdPreparing;
  elements.birdSwitchLabel.textContent = t(birdPreparing ? 'ui.birdPreparing' : birdActive ? 'ui.playAsAnt' : 'ui.flyAsBird');
  elements.birdSwitchShort.textContent = birdPreparing ? '...' : t(birdActive ? 'ui.ant' : 'ui.bird');
  elements.birdSwitchButton.setAttribute('aria-pressed', String(birdActive));
  elements.birdSwitchButton.setAttribute('aria-label', `${elements.birdSwitchLabel.textContent} (B)`);
  elements.birdSwitchButton.title = `${elements.birdSwitchLabel.textContent} (B)`;
  elements.exploreHint.hidden = !exploreActive || undergroundActive;
  elements.resetCameraButton.hidden = exploreActive;
  elements.resetCameraButton.setAttribute('aria-label', t(birdActive ? 'ui.resetBirdCamera.aria' : 'ui.resetCamera.aria'));
  elements.touchHint.textContent = t(exploreActive ? 'hint.touchExplore' : birdActive ? 'hint.touchBird' : 'hint.touchLook');
  document.body.classList.toggle('game-explore-active', exploreActive);
  document.body.classList.toggle('game-bird-active', birdActive);
  document.body.classList.toggle('game-underground-active', undergroundActive);
  debugControls.sync({ ready: gameReady });
  if (undergroundActive && exploreActive) {
    const mapData=session.getUndergroundMapData();
    elements.undergroundMapContent.innerHTML = renderUndergroundMap(mapData, t);
    if (!elements.undergroundMap.open) elements.undergroundMap.showModal();
    mapViewport.reset(mapData.position);
    const mapSession=session;
    const root=elements.undergroundMapContent.querySelector('svg');
    const capture=session.prepareUndergroundMapSurface?.();
    capture?.then((snapshot) => {
      if (session===mapSession && elements.undergroundMap.open
        && root===elements.undergroundMapContent.querySelector('svg')) {
        applySurfaceMap(elements.undergroundMapContent,snapshot);
      }
    }).catch((error) => console.warn('[the-quiet-pond] Could not update the surface map.',error));
    requestAnimationFrame(() => elements.undergroundMapClose.focus());
  } else if (elements.undergroundMap.open) {
    mapViewport.clear();
    elements.undergroundMap.close();
  }
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


function toggleExplore() {
  if (!session || paused) return;
  clearGameInput();
  if (!session.toggleExplore()) {
    updatePrompt('prompt.explore.finishClimb');
    return;
  }
  updateExploreControl();
  if (!elements.undergroundMap.open) requestAnimationFrame(() => session?.focusScene());
}

function closeUndergroundMap() {
  clearGameInput();
  session?.setExploreActive(false);
  updateExploreControl();
  requestAnimationFrame(() => paused ? elements.resumeButton.focus() : session?.focusScene());
}

async function toggleBird() {
  if (!session || !gameReady || paused || !elements.settingsDialog.hidden || !elements.aboutDialog.hidden) return;
  if (!session.canPlayBird() || session.isBirdPreparing()) return;
  clearGameInput();
  try {
    const switched = await session.toggleBird();
    if (switched) clearGameInput();
    else if (!paused) showRadioCaption(t('prompt.bird.noRoom'), 4);
  } catch (error) {
    console.warn('[the-quiet-pond] Could not prepare bird flight.', error);
    showRadioCaption(t('prompt.bird.loadFailed'), 5);
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
  let centerX = 0;
  let centerY = 0;
  let radius = 1;

  const reset = (event = null) => {
    if (event && event.pointerId !== activePointerId) return;
    const previousPointerId = activePointerId;
    activePointerId = null;
    session?.setMovementAxes(0, 0);
    touchRunHeld = false;
    syncRunning();
    joystick.classList.remove('is-held', 'is-running');
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
    const canRun = !session?.isClimbing() && !session?.isBirdActive() && !session?.isFlightEnabled();
    const nextRunning = shouldTouchRun(Math.min(1, distance / radius), touchRunHeld, canRun,
      POND_GAME.antMovement.touchRunThreshold, POND_GAME.antMovement.touchWalkThreshold);
    if (nextRunning !== touchRunHeld) {
      touchRunHeld = nextRunning;
      joystick.classList.toggle('is-running', nextRunning);
      syncRunning();
    }
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
      reset();
    }
  };

  joystick.addEventListener('pointerdown', onPointerDown);
  joystick.addEventListener('pointermove', onPointerMove);
  joystick.addEventListener('pointerup', reset);
  joystick.addEventListener('pointercancel', reset);
  joystick.addEventListener('lostpointercapture', reset);
  elements.climbButton?.addEventListener('click', onClimb);
  resetMobileControls = reset;

  mobileMovementCleanup = () => {
    resetMobileControls();
    joystick.removeEventListener('pointerdown', onPointerDown);
    joystick.removeEventListener('pointermove', onPointerMove);
    joystick.removeEventListener('pointerup', reset);
    joystick.removeEventListener('pointercancel', reset);
    joystick.removeEventListener('lostpointercapture', reset);
    elements.climbButton?.removeEventListener('click', onClimb);
    resetMobileControls = null;
    mobileMovementCleanup = null;
  };
}

window.addEventListener('keydown', (event) => {
  if (elements.materialStore.open) {
    if (event.code === 'Escape') { event.preventDefault(); closeMaterialStore(); }
    return;
  }
  if (elements.undergroundMap.open) {
    if ((event.code === 'Escape' || event.code === 'KeyM') && !event.repeat) {
      event.preventDefault(); closeUndergroundMap();
    }
    return;
  }
  if (sleepTransition || burrowTransition) { event.preventDefault(); return; }
  if (!elements.radioControlDialog.hidden) {
    if (event.code === 'Escape') { event.preventDefault(); closeRadioControl(); }
    return;
  }
  if (!elements.sleepDialog.hidden) {
    if (event.code === 'Escape') { event.preventDefault(); closeSleep(); }
    return;
  }
  if (!elements.cardsDialog.hidden) {
    if (event.code === 'Escape') { event.preventDefault(); closeCards(); }
    return;
  }
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
  if (event.code === 'Escape' && !event.repeat && canMoveAnt()
    && session?.getBuildingActions().some((action) => action.id === 'cancel')) {
    event.preventDefault(); performBuildingAction('cancel'); return;
  }
  const pauseKey = event.code === 'Escape' || event.code === 'KeyP';
  if (pauseKey && !event.repeat && (paused || !isEditableTarget(event.target))) {
    event.preventDefault();
    togglePause();
    return;
  }
  if (isEditableTarget(event.target)) return;
  if (event.code === 'KeyF' && !event.repeat && canMoveAnt()) {
    const action = session?.getBuildingActions()[0];
    if (action) { event.preventDefault(); if (!action.disabled) performBuildingAction(action.id); }
    return;
  }
  if (event.code === 'KeyU' && !event.repeat && canMoveAnt() && session?.canUseBurrow()) {
    event.preventDefault();
    useBurrow();
    return;
  }
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    if (canMoveAnt() && !event.repeat) heldRunCodes.add(event.code);
    syncRunning();
    return;
  }
  if (event.code === 'KeyE' && !event.repeat && session?.canSleep() && canMoveAnt()) {
    event.preventDefault();
    openSleep();
    return;
  }
  if (event.code === 'KeyM' && !event.repeat) {
    event.preventDefault();
    toggleExplore();
    return;
  }
  if (event.code === 'KeyB' && !event.repeat && session?.canPlayBird()) {
    event.preventDefault();
    toggleBird();
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
      if (session?.isFlightEnabled() || session?.isBirdActive()) {
        heldFlightCodes.add(event.code);
        session.setMovementKey('up', true);
      } else session?.toggleClimb();
    }
    return;
  }
  if (debugControls.handleKeyDown(event)) return;
  if ((event.code === 'ControlLeft' || event.code === 'ControlRight') && (session?.isFlightEnabled() || session?.isBirdActive())) {
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
  if (document.hidden && gameReady && session) {
    if (!paused) setPaused(true);
    else saveActiveSlot();
  }
});

elements.radioControlButton.addEventListener('click', openRadioControl);
byId('radio-control-close').addEventListener('click', closeRadioControl);
elements.radioKnobInput.addEventListener('input', () => updateMusicVolume(elements.radioKnobInput.value));
elements.radioKnobInput.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  elements.radioKnobInput.focus({ preventScroll: true });
  elements.radioKnobInput.setPointerCapture(event.pointerId);
  setRadioKnobFromPointer(event);
});
elements.radioKnobInput.addEventListener('pointermove', (event) => {
  if (elements.radioKnobInput.hasPointerCapture(event.pointerId)) setRadioKnobFromPointer(event);
});
elements.sleepButton.addEventListener('click', openSleep);
elements.burrowButton.addEventListener('click', useBurrow);
byId('sleep-close').addEventListener('click', closeSleep);
for (const choice of ['morning', 'evening']) {
  byId(`sleep-${choice}`).addEventListener('click', () => beginSleep(choice));
}
elements.cardsButton.addEventListener('click', () => openCards());
elements.cardsClose.addEventListener('click', closeCards);
elements.cardNotice.addEventListener('click', () => openCards(noticeCardId));
elements.pauseButton.addEventListener('click', togglePause);
elements.settingsButton.addEventListener('click', openSettingsDialog);
elements.closeSettingsButton.addEventListener('click', closeSettingsDialog);
elements.aboutShortcut.addEventListener('click', openAboutDialog);
elements.aboutShareButton.addEventListener('click', async () => {
  const url = elements.aboutShareLink.value;
  elements.aboutShareStatus.textContent = '';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'The Quiet Pond', url });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url);
    elements.aboutShareStatus.textContent = t('ui.about.share.copied');
  } catch {
    elements.aboutShareStatus.textContent = t('ui.about.share.select');
    elements.aboutShareLink.focus();
    elements.aboutShareLink.select();
  }
});
elements.aboutShareLink.addEventListener('click', () => elements.aboutShareLink.select());
elements.closeAboutButton.addEventListener('click', closeAboutDialog);
elements.resumeButton.addEventListener('click', () => setPaused(false));
elements.exploreButton.addEventListener('click', toggleExplore);
elements.undergroundMapClose.addEventListener('click', closeUndergroundMap);
elements.undergroundMapLabels.addEventListener('change', () => {
  setMapLabelsVisible(elements.undergroundMapContent, elements.undergroundMapLabels.checked);
});
byId('material-store-close').addEventListener('click', closeMaterialStore);
elements.materialStore.addEventListener('cancel', (event) => { event.preventDefault(); closeMaterialStore(); });
elements.undergroundMap.addEventListener('cancel', (event) => { event.preventDefault(); closeUndergroundMap(); });
elements.birdSwitchButton.addEventListener('click', toggleBird);
elements.resetCameraButton.addEventListener('click', resetCameraView);
elements.restartButton.addEventListener('click', () => {
  saveActiveSlot();
  window.location.reload();
});
elements.newGameButton.addEventListener('click', () => startNewGame());
elements.antVisibilityEnabled.addEventListener('change', () => {
  antVisibilityEnabled = elements.antVisibilityEnabled.checked;
  try {
    window.localStorage.setItem(ANT_VISIBILITY_KEY, antVisibilityEnabled ? '1' : '0');
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store the ant visibility preference.', error);
  }
  session?.setAntVisibilityEnabled(antVisibilityEnabled);
});

elements.antTrailsEnabled.addEventListener('change', () => {
  antTrailsEnabled = elements.antTrailsEnabled.checked;
  try {
    window.localStorage.setItem(ANT_TRAILS_KEY, antTrailsEnabled ? '1' : '0');
  } catch (error) {
    console.warn('[the-quiet-pond] Could not store the trail preference.', error);
  }
  session?.setAntTrailsEnabled(antTrailsEnabled);
});

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
  if (event.target.closest('.game-checklist__toggle, #cards-button')) return;
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
      antTrailsEnabled,
      antVisibilityEnabled,
      musicVolume,
      saveState: saveSlots[activeSaveSlotIndex]?.state ?? null,
    });
    await session.start();
    syncPerformanceDiagnosticSubscription();
    setChecklistCollapsed(true);
    gameReady = true;
    renderChecklist(latestSnapshot?.checklist);
    debugControls.start(elements.scene.querySelector('canvas'));
    setupMobileGameControls();
    session.onFrame(updateSleepButton);
    session.onFrame(updateBurrowButton);
    session.onFrame(updateBuildingControls);
    session.onFrame(updateRadioControlButton);
    updateExploreControl();
    saveActiveSlot();
    renderSaveSlots();
    updateLoadingProgress(100);
    window.setTimeout(() => { elements.loading.hidden = true; }, 180);
  } catch (error) {
    debugControls.dispose();
    performanceDiagnosticUnsubscribe?.();
    performanceDiagnosticUnsubscribe = null;
    session?.dispose();
    session = null;
    showStartupError(error);
  }
}

window.addEventListener('pagehide', () => saveActiveSlot());
window.addEventListener('beforeunload', () => {
  saveActiveSlot();
  gameplayLayout.dispose();
  window.clearTimeout(buildingNoticeTimer);
  mapViewport.dispose();
  window.clearTimeout(saveTimeout);
  debugControls.dispose();
  performanceDiagnosticUnsubscribe?.();
  performanceDiagnosticUnsubscribe = null;
  mobileMovementCleanup?.();
  session?.dispose();
});

registerGameServiceWorker();
setPerformanceDiagnosticEnabled(performanceDiagnosticEnabled);
startGame();
applyLanguage();
