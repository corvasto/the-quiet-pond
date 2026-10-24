// Quality is selected once at module startup. No profile checks run in the frame loop.
// URL selection takes precedence over the saved preference and device default.
const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' && (
  navigator.userAgentData?.mobile === true
  || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
);

// Profile property conventions:
// - sceneQuality selects generator geometry detail, not the `q` profile name.
// - Update intervals and frameInterval are seconds; zero means every available frame.
// - pondRippleSimulationSize and shadowMapSize are square texture side lengths in pixels.
// - rainImpactIntervalScale reduces impact frequency as the value increases.
// - Density scale values multiply generated instance counts before scene construction.
// - Feature flags can also gate optional asset descriptors through their `requires` field.
export const QUALITY_PRESETS = Object.freeze({
  full: Object.freeze({
    sceneQuality: 'high',
    pondReflections: true,
    reflectionUpdateInterval: 0,
    pondRipples: true,
    pondRippleUpdateInterval: 0,
    pondRippleSimulationSize: 128,
    shadows: true,
    shadowMapSize: 2048,
    shadowUpdateInterval: 0,
    rain: true,
    rainDropCount: 1150,
    rainImpactCount: 44,
    rainImpactIntervalScale: 1,
    rainUpdateInterval: 0,
    leafWind: true,
    fireflies: true,
    animatedCat: true,
    backgroundAnts: true,
    modelFlowers: true,
    sunGlare: true,
    maximumPixelRatio: 1.75,
    grassDensityScale: 1,
    bushPopulationScale: 2.78,
    frameInterval: 0,
    // Texture anisotropy is capped again by the active GPU capability.
    modelAnisotropy: 8,
    // Release the drawing buffer after presentation; gameplay has no frame exporter.
    preserveDrawingBuffer: false,
  }),
  mid: Object.freeze({
    // Generate the same smooth terrain, trees, rocks, props, and water mesh as full.
    sceneQuality: 'high',
    // Reuse expensive reflection and shadow textures between refreshes.
    pondReflections: true,
    reflectionUpdateInterval: 1 / 3,
    pondRipples: true,
    pondRippleUpdateInterval: 1 / 8,
    pondRippleSimulationSize: 64,
    shadows: true,
    shadowMapSize: 512,
    shadowUpdateInterval: 1 / 2,
    rain: true,
    rainDropCount: 300,
    rainImpactCount: 18,
    rainImpactIntervalScale: 2.4,
    rainUpdateInterval: 1 / 8,
    leafWind: true,
    fireflies: true,
    animatedCat: true,
    backgroundAnts: true,
    modelFlowers: true,
    sunGlare: true,
    maximumPixelRatio: 1,
    grassDensityScale: 0.4,
    bushPopulationScale: 1.8,
    frameInterval: 1 / 20,
    modelAnisotropy: 4,
    preserveDrawingBuffer: false,
  }),
  low: Object.freeze({
    // Keep smooth scene geometry and reduce repeated rendering work more aggressively.
    sceneQuality: 'high',
    pondReflections: true,
    reflectionUpdateInterval: 1 / 2,
    pondRipples: true,
    pondRippleUpdateInterval: 1 / 6,
    pondRippleSimulationSize: 36,
    shadows: true,
    shadowMapSize: 128,
    shadowUpdateInterval: 1,
    rain: true,
    rainDropCount: 150,
    rainImpactCount: 10,
    rainImpactIntervalScale: 3.2,
    rainUpdateInterval: 1 / 6,
    leafWind: true,
    fireflies: true,
    animatedCat: true,
    backgroundAnts: false,
    modelFlowers: false,
    sunGlare: false,
    maximumPixelRatio: 0.7,
    grassDensityScale: 0.24,
    bushPopulationScale: 1.2,
    frameInterval: 1 / 20,
    modelAnisotropy: 2,
    preserveDrawingBuffer: false,
  }),
});

export const PERFORMANCE_DIAGNOSTIC = Object.freeze({
  sampleSeconds: 0.75,
  recoveryMargin: 2,
  warningFps: Object.freeze({
    full: 30,
    mid: 14,
    low: 14,
  }),
});

export function requestedQualityProfile(search = globalThis.location?.search ?? '') {
  const parameters = new URLSearchParams(search);
  const requested = parameters.get('q')?.toLowerCase();
  if (requested === 'full' || requested === 'mid' || requested === 'low') return requested;
  return null;
}

export const QUALITY_STORAGE_KEY = 'the-quiet-pond-quality';

export function storedQualityPreference() {
  try {
    const value = globalThis.localStorage?.getItem(QUALITY_STORAGE_KEY);
    return ['full', 'mid', 'low'].includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveQualityProfile(search, preference, mobile = IS_MOBILE_DEVICE) {
  return requestedQualityProfile(search)
    ?? (['full', 'mid', 'low'].includes(preference) ? preference : null)
    ?? (mobile ? 'mid' : 'full');
}

export const QUALITY_PROFILE_NAME = resolveQualityProfile(
  globalThis.location?.search ?? '', storedQualityPreference(),
);
export const PERFORMANCE = QUALITY_PRESETS[QUALITY_PROFILE_NAME];
