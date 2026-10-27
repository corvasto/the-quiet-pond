import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { APP_METADATA, APP_VERSION } from '../js/config/app.js';
import {
  PERFORMANCE_DIAGNOSTIC,
  QUALITY_PRESETS,
  requestedQualityProfile,
  resolveQualityProfile,
} from '../js/config/quality.js';
import { DEBUG_CONFIG, requestedDebugMode } from '../js/config/world.js';
import { TIME_OF_DAY } from '../js/config/scene.js';
import * as SCENE_CONFIG from '../js/config/scene.js';
import { ASSET_CATALOG } from '../js/content/assets.js';
import {
  MESSAGE_CATALOG,
  MESSAGE_DEFINITIONS,
  SUPPORTED_LANGUAGES,
} from '../js/content/messages.js';
import { GAME_OBJECTIVES } from '../js/content/objectives.js';
import {
  INTERACTION_CONFIG,
  OBJECTIVE_TUNING,
  SEED_CONFIG,
} from '../js/config/content.js';
import { RADIO_AUDIO_CONFIG } from '../js/config/radio.js';
import { AMBIENCE_CONFIG } from '../js/config/ambience.js';
import { getNightAmount, normalizeDayHour } from '../js/utils/time-of-day.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameHtmlPath = path.join(projectRoot, 'index.html');
const gameHtml = fs.readFileSync(gameHtmlPath, 'utf8');
const gameHtmlUrl = pathToFileURL(gameHtmlPath);
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function listFiles(directory, extensions) {
  const matches = [];
  if (!fs.existsSync(directory)) return matches;
  const visit = (current) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (extensions.some((extension) => entry.name.endsWith(extension))) matches.push(entryPath);
    });
  };
  visit(directory);
  return matches;
}

function shellPathFromFile(filePath) {
  return `./${path.relative(projectRoot, filePath).replaceAll('\\', '/')}`;
}

function readAppShell() {
  const source = fs.readFileSync(path.join(projectRoot, 'service-worker.js'), 'utf8');
  const block = source.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] ?? '';
  return {
    source,
    entries: [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]),
  };
}

function readImportMap() {
  const block = gameHtml.match(/<script\s+type="importmap">([\s\S]*?)<\/script>/i)?.[1];
  if (!block) {
    check(false, 'index.html has no import map.');
    return {};
  }
  try {
    return JSON.parse(block).imports ?? {};
  } catch (error) {
    check(false, `index.html import map is invalid JSON: ${error.message}`);
    return {};
  }
}

const importMap = readImportMap();

function resolveModuleSpecifier(specifier, importerPath) {
  if (specifier.startsWith('.')) {
    return fileURLToPath(new URL(specifier, pathToFileURL(importerPath)));
  }
  const exact = importMap[specifier];
  if (exact) return fileURLToPath(new URL(exact, gameHtmlUrl));
  const prefix = Object.keys(importMap)
    .filter((key) => key.endsWith('/') && specifier.startsWith(key))
    .sort((left, right) => right.length - left.length)[0];
  if (!prefix) return null;
  return fileURLToPath(new URL(`${importMap[prefix]}${specifier.slice(prefix.length)}`, gameHtmlUrl));
}

function collectLocalModuleDependencies(entryRelativePath) {
  const visited = new Set();
  const active = new Set();
  const visit = (filePath) => {
    const normalized = path.normalize(filePath);
    if (visited.has(normalized)) return;
    visited.add(normalized);
    active.add(normalized);
    const source = fs.readFileSync(normalized, 'utf8');
    const importPattern = /^\s*(?:import|export)\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
    for (const match of source.matchAll(importPattern)) {
      const dependencyPath = resolveModuleSpecifier(match[1], normalized);
      check(Boolean(dependencyPath), `Unresolved module imported by ${shellPathFromFile(normalized)}: ${match[1]}`);
      if (!dependencyPath) continue;
      check(fs.existsSync(dependencyPath), `Missing module imported by ${shellPathFromFile(normalized)}: ${match[1]}`);
      if (!fs.existsSync(dependencyPath)) continue;
      check(!active.has(dependencyPath), `Module import cycle reaches ${shellPathFromFile(dependencyPath)}.`);
      if (!active.has(dependencyPath)) visit(dependencyPath);
    }
    active.delete(normalized);
  };
  visit(path.join(projectRoot, entryRelativePath));
  return visited;
}

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const manifest = readJson('manifest.webmanifest');
check(packageJson.version === APP_VERSION, `package.json version ${packageJson.version} does not match ${APP_VERSION}.`);
check(packageLock.version === APP_VERSION, 'package-lock.json version does not match APP_VERSION.');
check(packageLock.packages?.['']?.version === APP_VERSION, 'package-lock.json root version does not match APP_VERSION.');
check(packageLock.packages?.['']?.name === packageJson.name, 'package-lock.json root name does not match package.json.');
check(manifest.name === APP_METADATA.name, 'Manifest name does not match APP_METADATA.');
check(manifest.short_name === APP_METADATA.shortName, 'Manifest short name does not match APP_METADATA.');
check(manifest.start_url === './index.html', 'Manifest start URL must remain index.html.');

const { source: serviceWorkerSource, entries: appShellEntries } = readAppShell();
const appShell = new Set(appShellEntries);
check(appShell.size === appShellEntries.length, 'service-worker.js APP_SHELL contains duplicate paths.');
appShell.forEach((entry) => {
  const diskPath = path.resolve(projectRoot, entry.replace(/^\.\//, ''));
  const insideProject = diskPath === projectRoot || diskPath.startsWith(`${projectRoot}${path.sep}`);
  check(insideProject, `APP_SHELL path escapes the project: ${entry}`);
  check(fs.existsSync(diskPath), `APP_SHELL path does not exist: ${entry}`);
});
[
  './index.html',
  './styles/game.css',
  './manifest.webmanifest',
  './icon.png',
  './js/main.js',
].forEach((entry) => check(appShell.has(entry), `Required application-shell entry is missing: ${entry}`));

const cachePrefix = serviceWorkerSource.match(/const CACHE_PREFIX = '([^']+)'/)?.[1];
const releaseVersion = serviceWorkerSource.match(/const RELEASE_VERSION = '([^']+)'/)?.[1];
check(cachePrefix === APP_METADATA.serviceWorkerCachePrefix, 'Service-worker cache prefix does not match APP_METADATA.');
check(releaseVersion === APP_VERSION, 'Service-worker RELEASE_VERSION does not match APP_VERSION.');
check(serviceWorkerSource.includes("searchParams.get('v')"), 'Service worker does not inspect the requested registration version.');
check(serviceWorkerSource.includes('`${CACHE_PREFIX}${RELEASE_VERSION}`'), 'Service-worker cache name is not tied to RELEASE_VERSION.');
check(serviceWorkerSource.includes('key.startsWith(CACHE_PREFIX)'), 'Service-worker cleanup is not restricted to Quiet Pond caches.');

const gameModules = collectLocalModuleDependencies('js/main.js');
gameModules.forEach((filePath) => {
  const entry = shellPathFromFile(filePath);
  check(appShell.has(entry), `Game module is not pre-cached: ${entry}`);
});

Object.entries(ASSET_CATALOG).forEach(([id, descriptor]) => {
  const filePath = fileURLToPath(descriptor.url);
  check(fs.existsSync(filePath), `Asset ${id} points to a missing file: ${descriptor.file}`);
  check(descriptor.file.toLowerCase().endsWith('.glb'), `Asset ${id} must use a local GLB file.`);
  check(Number.isFinite(descriptor.size.width) && descriptor.size.width > 0, `Asset ${id} has an invalid width.`);
  check(Object.values(descriptor.orientation.rotationDegrees).every(Number.isFinite), `Asset ${id} has an invalid rotation.`);
  check(typeof descriptor.placement.strategy === 'string' && descriptor.placement.strategy.length > 0, `Asset ${id} has no placement strategy.`);
  check(descriptor.placement.count === null || (Number.isInteger(descriptor.placement.count) && descriptor.placement.count >= 0), `Asset ${id} has an invalid instance count.`);
  if (descriptor.placement.position) {
    check(Number.isFinite(descriptor.placement.position.x) && Number.isFinite(descriptor.placement.position.z), `Asset ${id} has an invalid authored position.`);
  }
  if (descriptor.placement.strategy === 'fixed-ground') {
    check(Boolean(descriptor.placement.position), `Fixed-ground asset ${id} has no authored position.`);
  }
  check(descriptor.modes.length > 0, `Asset ${id} is not enabled in any mode.`);
  check(new Set(descriptor.modes).size === descriptor.modes.length, `Asset ${id} repeats a supported mode.`);
  check(descriptor.modes.every((mode) => mode === 'game'), `Asset ${id} has an invalid mode.`);
  check(descriptor.requiredModes.every((mode) => descriptor.modes.includes(mode)), `Asset ${id} is required in a mode where it is not loaded.`);
  if (descriptor.requires) {
    Object.entries(QUALITY_PRESETS).forEach(([profileName, profile]) => {
      check(Object.hasOwn(profile, descriptor.requires), `Asset ${id} uses unknown quality gate ${descriptor.requires} in ${profileName}.`);
    });
  }
  const frameRanges = {
    ...(descriptor.animation?.ranges ?? {}),
    ...(descriptor.animation?.frames ? { frames: descriptor.animation.frames } : {}),
  };
  Object.entries(frameRanges).forEach(([name, range]) => {
    check(
      Array.isArray(range)
        && range.length === 2
        && range.every(Number.isFinite)
        && range[0] >= 0
        && range[1] > range[0],
      `Asset ${id} has an invalid ${name} animation frame range.`,
    );
  });
  if (descriptor.modes.includes('game')) {
    check(appShell.has(shellPathFromFile(filePath)), `Game asset is not pre-cached: ${descriptor.file}`);
  }
});

const audioUrls = [
  ...Object.values(RADIO_AUDIO_CONFIG.music),
  RADIO_AUDIO_CONFIG.static.url,
];
audioUrls.forEach((url) => {
  const filePath = fileURLToPath(url);
  check(fs.existsSync(filePath), `Radio audio file is missing: ${shellPathFromFile(filePath)}`);
  check(appShell.has(shellPathFromFile(filePath)), `Radio audio file is not pre-cached: ${shellPathFromFile(filePath)}`);
});
Object.values(RADIO_AUDIO_CONFIG.announcements).forEach(({ file }) => {
  ['en', 'id'].forEach((language) => {
    const filePath = path.join(projectRoot, 'assets', 'audio', 'radio', language, file);
    check(fs.existsSync(filePath), `Announcement is missing for ${language}: ${file}`);
    check(appShell.has(shellPathFromFile(filePath)), `Announcement is not pre-cached for ${language}: ${file}`);
  });
});
Object.values(AMBIENCE_CONFIG.tracks).forEach(({ url }) => {
  const filePath = fileURLToPath(url);
  check(fs.existsSync(filePath), `Ambience audio file is missing: ${shellPathFromFile(filePath)}`);
  check(appShell.has(shellPathFromFile(filePath)), `Ambience audio file is not pre-cached: ${shellPathFromFile(filePath)}`);
});

const englishKeys = Object.keys(MESSAGE_CATALOG.en).sort();
const supportedLanguageKeys = [...SUPPORTED_LANGUAGES].sort();
Object.entries(MESSAGE_DEFINITIONS).forEach(([messageKey, translations]) => {
  check(
    JSON.stringify(Object.keys(translations).sort()) === JSON.stringify(supportedLanguageKeys),
    `Message ${messageKey} must define exactly the supported languages.`,
  );
  SUPPORTED_LANGUAGES.forEach((language) => {
    check(
      typeof translations[language] === 'string' && translations[language].trim().length > 0,
      `Message ${messageKey} has an empty ${language} translation.`,
    );
  });
});
Object.entries(MESSAGE_CATALOG).forEach(([language, catalog]) => {
  const keys = Object.keys(catalog).sort();
  check(JSON.stringify(keys) === JSON.stringify(englishKeys), `Locale ${language} does not match the English message keys.`);
});
check(
  Array.isArray(SEED_CONFIG.spawnSurfacePattern)
    && SEED_CONFIG.spawnSurfacePattern.length > 0,
  'The seed spawn surface pattern must contain at least one surface.',
);
SEED_CONFIG.spawnSurfacePattern.forEach((surface) => {
  check(SEED_CONFIG.spawnSurfaces[surface] === true, `Seed sequence uses disabled surface: ${surface}`);
});
check(
  Array.isArray(SEED_CONFIG.storedSeedSlots) && SEED_CONFIG.storedSeedSlots.length > 0,
  'The stored seed layout must contain at least one configured slot.',
);
GAME_OBJECTIVES.forEach((objective) => {
  check(Boolean(MESSAGE_CATALOG.en[objective.labelKey]), `Objective ${objective.id} has no English label key.`);
  check(Boolean(MESSAGE_CATALOG.id[objective.labelKey]), `Objective ${objective.id} has no Indonesian label key.`);
  check(['always', 'raining', 'night', 'fireflyWindow'].includes(objective.availability), `Objective ${objective.id} has an invalid availability rule.`);
  check(
    !objective.managed || ['proximity2d', 'proximity3d', 'shelter', 'pondSurface'].includes(objective.evaluator),
    `Objective ${objective.id} has an invalid evaluator.`,
  );
  if (objective.evaluator === 'proximity2d' || objective.evaluator === 'proximity3d') {
    check(Boolean(objective.target), `Objective ${objective.id} has no proximity target.`);
    check(Object.hasOwn(OBJECTIVE_TUNING, objective.radiusKey), `Objective ${objective.id} uses an unknown radius key.`);
  }
});
[
  INTERACTION_CONFIG.allObjectivesMessageKey,
  ...Object.values(INTERACTION_CONFIG.messageKeys),
].forEach((messageKey) => {
  check(Boolean(MESSAGE_CATALOG.en[messageKey]), `Interaction message key is missing in English: ${messageKey}`);
  check(Boolean(MESSAGE_CATALOG.id[messageKey]), `Interaction message key is missing in Indonesian: ${messageKey}`);
});

check(JSON.stringify(Object.keys(QUALITY_PRESETS).sort()) === JSON.stringify(['full', 'low', 'mid']), 'Quality profiles must be full, mid, and low.');
check(requestedQualityProfile('?q=low') === 'low', 'q=low must select the low profile.');
check(requestedQualityProfile('?q=MID') === 'mid', 'Quality profile values must be case-insensitive.');
check(requestedQualityProfile('?q=full') === 'full', 'q=full must select the full profile.');
check(resolveQualityProfile('?q=low', 'full', false) === 'low', 'URL quality must override stored quality.');
check(resolveQualityProfile('', 'low', false) === 'low', 'Stored quality must override the device default.');
check(resolveQualityProfile('?q=invalid', 'mid', false) === 'mid', 'Invalid URL quality must fall back to saved quality.');
check(resolveQualityProfile('', 'auto', true) === 'mid', 'Mobile Auto must choose mid.');
check(resolveQualityProfile('', 'invalid', false) === 'full', 'Invalid saved quality must use the device default.');
check(requestedDebugMode('?q=mid&debug=1'), 'debug=1 must enable debug alongside quality.');
for (const search of ['', '?debug', '?debug=0', '?debug=false', '?debug=true', '?debug=unknown']) {
  check(!requestedDebugMode(search), `${search || 'No query'} must leave debug disabled.`);
}
check(!DEBUG_CONFIG.enabled && !DEBUG_CONFIG.allowToggle && !DEBUG_CONFIG.allowExploreRelocation
  && !DEBUG_CONFIG.allowRadioControls && !DEBUG_CONFIG.showObjectiveMarkers,
'Default config must disable debug tools.');
check(requestedQualityProfile('') === null, 'A missing q value must use automatic profile selection.');
check(requestedQualityProfile('?q=unknown') === null, 'An unknown q value must use automatic profile selection.');
Object.entries(QUALITY_PRESETS).forEach(([name, profile]) => {
  check(profile.sceneQuality === 'high', `Quality profile ${name} must retain High Quality scene generation.`);
  check(Number.isFinite(profile.frameInterval) && profile.frameInterval >= 0, `Quality profile ${name} has an invalid frame interval.`);
  check(!Object.hasOwn(profile, 'mobileFrameInterval'), `Quality profile ${name} still has the removed mobileFrameInterval property.`);
  check(!Object.hasOwn(profile, 'rockQuality'), `Quality profile ${name} still has the removed rockQuality override.`);
});
check(PERFORMANCE_DIAGNOSTIC.warningFps.full === 30, 'Full quality FPS warning threshold must be 30.');
check(PERFORMANCE_DIAGNOSTIC.warningFps.mid === 14, 'Mid quality FPS warning must allow normal capped-frame scheduling.');
check(PERFORMANCE_DIAGNOSTIC.warningFps.low === 14, 'Low quality FPS warning must allow normal capped-frame scheduling.');
check(TIME_OF_DAY.dawnStartHour === 5, 'Dawn must start at 05:00.');
check(TIME_OF_DAY.dawnEndHour > TIME_OF_DAY.dawnStartHour, 'Dawn must end after it starts.');
check(TIME_OF_DAY.duskEndHour > TIME_OF_DAY.duskStartHour, 'Dusk must end after it starts.');
check(normalizeDayHour(0) === 0 && normalizeDayHour(24) === 0, 'Midnight hour wrapping is invalid.');
check(getNightAmount(0.01) === 1, 'Post-midnight lighting must remain fully dark.');
check(getNightAmount(TIME_OF_DAY.dawnStartHour) === 1, 'Lighting must remain fully dark until dawn starts.');
check(getNightAmount(TIME_OF_DAY.dawnEndHour) === 0, 'Dawn must finish in daytime lighting.');

const gameModeSource = fs.readFileSync(path.join(projectRoot, 'js/main.js'), 'utf8');
const gameSessionSource = fs.readFileSync(path.join(projectRoot, 'js/game/game-session.js'), 'utf8');
const debugOverlaySource = fs.readFileSync(path.join(projectRoot, 'js/ui/debug-overlay.js'), 'utf8');
check(!/Version \d+\.\d+\.\d+/.test(gameHtml), 'index.html contains a hardcoded app version.');
check(!gameHtml.includes("navigator.serviceWorker.register('./service-worker.js'"), 'index.html contains an unversioned service-worker registration.');
check(gameHtml.includes('aria-valuemax="1"'), 'index.html needs a valid initial seed progress maximum before startup.');
check(gameHtml.includes('id="about-attribution-title"'), 'The About dialog is missing its attribution section.');
check(gameHtml.includes('id="debug-coordinate-values"'), 'The debug ant-coordinate output is missing.');
const pauseDialogMarkup = gameHtml.slice(
  gameHtml.indexOf('id="pause-dialog"'),
  gameHtml.indexOf('id="settings-dialog"'),
);
const settingsDialogMarkup = gameHtml.slice(
  gameHtml.indexOf('id="settings-dialog"'),
  gameHtml.indexOf('id="about-dialog"'),
);
check(pauseDialogMarkup.includes('id="restart-button"'), 'Pause is missing its restart action.');
check(pauseDialogMarkup.includes('id="save-slot-list"'), 'Pause is missing save-slot management.');
for (const id of ['language-select', 'sound-enabled', 'performance-diagnostic-enabled', 'quality-select']) {
  check(!pauseDialogMarkup.includes(`id="${id}"`), `Pause must not contain ${id}.`);
  check(settingsDialogMarkup.includes(`id="${id}"`), `Settings must contain ${id}.`);
}
check(gameHtml.includes('id="about-shortcut"'), 'The global About shortcut is missing.');
check(!settingsDialogMarkup.includes('id="about-button"'), 'About must not be nested inside Settings.');
check(gameHtml.includes('id="performance-diagnostic"'), 'The FPS diagnostic HUD is missing.');
check(
  /function syncPerformanceDiagnosticSubscription\(\)[\s\S]*?if \(!performanceDiagnosticEnabled \|\| !session\) return;[\s\S]*?session\.onFrame\(updatePerformanceDiagnostic\)/.test(gameModeSource),
  'The FPS diagnostic must subscribe to rendered frames only while enabled.',
);
check(
  debugOverlaySource.includes('DEBUG_COORDINATE_UPDATE_MS = 100')
  && debugOverlaySource.includes('session?.getPlayerWorldPosition()'),
  'The debug coordinate readout must use the bounded world-position sampler.',
);
check(
  /getAntWorldPosition\(\)\s*\{[\s\S]*?this\.debugPosition/.test(gameSessionSource),
  'PondGameSession must expose the reusable ant world-position target.',
);
for (const match of gameHtml.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)) {
  check(Boolean(MESSAGE_CATALOG.en[match[1]]), `index.html uses an unknown English localization key: ${match[1]}`);
  check(Boolean(MESSAGE_CATALOG.id[match[1]]), `index.html uses an unknown Indonesian localization key: ${match[1]}`);
}
check(
  /service-worker\.js\?v=\$\{encodeURIComponent\(APP_VERSION\)\}/.test(gameModeSource),
  'js/main.js does not register the service worker with APP_VERSION.',
);

const policyFiles = [
  path.join(projectRoot, 'AGENTS.md'),
  path.join(projectRoot, 'README.md'),
  ...listFiles(path.join(projectRoot, 'docs'), ['.md']),
  ...listFiles(path.join(projectRoot, 'plans'), ['.md']),
  ...listFiles(path.join(projectRoot, 'js'), ['.js']),
  ...listFiles(path.join(projectRoot, 'scripts'), ['.mjs']),
  path.join(projectRoot, 'service-worker.js'),
];
const emDash = String.fromCodePoint(0x2014);
for (const filePath of policyFiles.filter((entry) => entry.endsWith('.md'))) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^\w+:/.test(target)) continue;
    check(fs.existsSync(path.resolve(path.dirname(filePath), target)), `Broken documentation link in ${shellPathFromFile(filePath)}: ${target}`);
  }
}
policyFiles.forEach((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  const policyText = /\.(?:js|mjs)$/.test(filePath)
    ? (source.match(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g) ?? []).join('\n')
    : source;
  check(!policyText.includes(emDash), `${shellPathFromFile(filePath)} contains an em dash in documentation or a code comment.`);
});

const syntaxFiles = new Set([
  ...listFiles(path.join(projectRoot, 'js'), ['.js']),
  ...listFiles(path.join(projectRoot, 'scripts'), ['.mjs']),
  ...gameModules,
  path.join(projectRoot, 'service-worker.js'),
]);
syntaxFiles.forEach((filePath) => {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  check(result.status === 0, `JavaScript syntax check failed for ${shellPathFromFile(filePath)}: ${(result.stderr || result.stdout).trim()}`);
});

if (failures.length > 0) {
  console.error(`Project validation failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Project validation passed for The Quiet Pond ${APP_VERSION}.`);
  console.log(`Checked ${gameModules.size} game modules, ${Object.keys(ASSET_CATALOG).length} assets, ${appShell.size} pre-cache paths, and ${syntaxFiles.size} scripts.`);
}
