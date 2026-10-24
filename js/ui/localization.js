import {
  MESSAGE_CATALOG,
  normalizeLanguage,
  translateMessage,
} from '../content/messages.js';

export { MESSAGE_CATALOG, normalizeLanguage, translateMessage };

function translateLandmark(label, language) {
  if (language !== 'id') return label;
  return {
    'a pond rock': 'batu kolam',
    'a rock': 'batu',
    'the ash tree': 'pohon ash',
    'a companion tree': 'pohon pendamping',
    'the seated person': 'orang yang sedang duduk',
    'the radio': 'radio',
    'the corner lamp': 'lampu sudut',
    'the tent': 'tenda',
  }[label] ?? label;
}

export function translate(text, language = 'en', parameters = {}) {
  const message = String(text ?? '');
  const normalizedLanguage = normalizeLanguage(language);
  const stableTranslation = translateMessage(message, normalizedLanguage, parameters);
  if (stableTranslation !== message || MESSAGE_CATALOG.en[message]) return stableTranslation;

  const version = message.match(/^Version (.+)$/);
  if (version) return translateMessage('ui.version', normalizedLanguage, { version: version[1] });

  const seedProgress = message.match(/^Seeds (\d+) \/ (\d+)$/);
  if (seedProgress && normalizedLanguage === 'id') {
    return `Benih ${seedProgress[1]} / ${seedProgress[2]}`;
  }
  const climbPrompt = message.match(/^Head near (.+), then use the climb action\.$/);
  if (climbPrompt) {
    return translateMessage('prompt.climb.near', normalizedLanguage, {
      landmark: translateLandmark(climbPrompt[1], normalizedLanguage),
    });
  }
  const surfacePrompt = message.match(/^On (.+)\. Move to roam, or use the climb action to get down\.$/);
  if (surfacePrompt) {
    return translateMessage('prompt.climb.surface', normalizedLanguage, {
      landmark: translateLandmark(surfacePrompt[1], normalizedLanguage),
    });
  }
  const cannotStand = message.match(/^Could not stand on (.+)\.$/);
  if (cannotStand) {
    return translateMessage('prompt.climb.cannotStand', normalizedLanguage, {
      landmark: translateLandmark(cannotStand[1], normalizedLanguage),
    });
  }
  const lostSurface = message.match(/^Lost the roaming surface on (.+)\.$/);
  if (lostSurface) {
    return translateMessage('prompt.climb.lostSurface', normalizedLanguage, {
      landmark: translateLandmark(lostSurface[1], normalizedLanguage),
    });
  }
  const nearby = message.match(/^Find an active seed\. (\d+) nearby\.$/);
  if (nearby && normalizedLanguage === 'id') {
    return `Temukan benih yang aktif. Ada ${nearby[1]} di dekat sini.`;
  }
  return message;
}

export function formatSeedProgress(deposited, total, language = 'en') {
  return normalizeLanguage(language) === 'id'
    ? `Benih ${deposited} / ${total}`
    : `Seeds ${deposited} / ${total}`;
}
