import { PERFORMANCE } from './quality.js';

export const GRASS_VISIBILITY = Object.freeze({
  enabled: true,
  playerRadius: 0.95,
  cameraCorridorRadius: 0.55,
  minimumHeightScale: 0.12,
  transitionRate: 10,
});

export const ANT_LOCATOR = Object.freeze({
  color: '#ff1f18',
  coreColor: '#ff827a',
  height: 16,
  outerRadius: 0.22,
  coreRadius: 0.045,
  baseOffset: 0.035,
  sphereRadius: 0.34,
  sphereOffsetY: 0.04,
  outerOpacity: 0.24,
  coreOpacity: 0.92,
  sphereOpacity: 0.3,
  pulseSpeed: 3.4,
  renderOrder: 20,
});

export const DEFAULTS = Object.freeze({
  seed: 'ancient-oak',
  season: 'summer', //summer|spring|autumn
  // Tree shape values are multipliers consumed by the procedural tree generator.
  age: 1.2,
  branchSpread: 1.3,
  leafDensity: 1.5,
  grassDensity: 0.8,
  wind: 0.35,
  rainEnabled: false,
  rainIntensity: PERFORMANCE.rain ? 0.7 : 0,
  cameraFov: 36,
  // Decimal 24-hour fallback. The game session injects POND_GAME.time.startHour.
  sunHour: 10.5,
  // Generator geometry tier inherited from the selected q profile, not the profile name itself.
  quality: PERFORMANCE.sceneQuality,
  autoRotate: false,
  // Imported-prop rotations are degree deltas and offsets are additive world units.
  // These runtime placement defaults preserve authored game prop transforms.
  radioScale: 1,
  radioRotation: 0,
  radioOffsetX: 0,
  radioOffsetY: 0,
  radioOffsetZ: 0,
  readerScale: 1,
  readerRotation: 0,
  readerOffsetX: 0,
  readerOffsetY: 0,
  readerOffsetZ: 0,
  tentScale: 1,
  tentRotation: 0,
  tentOffsetX: 0,
  tentOffsetY: 0,
  tentOffsetZ: 0,
});

export const ENVIRONMENT = Object.freeze({
  sunGlare: PERFORMANCE.sunGlare,
});

export const ANT_NIGHT_LIGHT = Object.freeze({
  color: '#d9e8ff',
  intensity: 0.8,
  distance: 3.5,
  decay: 0.2,
  // World-space gap above the ant model's measured top surface.
  height: 0.075,
});

export const TIME_OF_DAY = Object.freeze({
  // Used only when a caller supplies a missing or non-finite hour.
  fallbackHour: 10.5,
  // Dawn starts at 05:00 and reaches the established daytime lighting at 07:00.
  dawnStartHour: 5,
  dawnEndHour: 7,
  // Dusk keeps the existing 19:00 to 21:00 lighting transition.
  duskStartHour: 19,
  duskEndHour: 21,
  // The physical atmosphere hands off to the deep-blue night dome at this hour.
  nightSkyStartHour: 19.25,
  // Stars fade in slightly after the night-sky handoff instead of appearing at once.
  starDuskStartHour: 19.5,
  starDuskEndHour: 20.5,
});

export const DIORAMA = Object.freeze({
  size: 18,
  baseDepth: 1.6,
});

const POND_HABITAT = Object.freeze({
  id: 'pond',
  label: 'Pond 30 m',
  detailSize: 30,
  // Multiplies generated vegetation and prop populations for the larger habitat.
  populationScale: 2.78,
  // The generator selects one segment count from the active sceneQuality tier.
  terrainSegmentsHigh: 120,
  terrainSegmentsLow: 70,
  shrubRadius: 13,
  cameraMaxDistance: 62,
  hasPond: true,
  infinite: false,
});

export function getHabitatArea() {
  return POND_HABITAT;
}

export const SEASONS = Object.freeze({
  spring: Object.freeze({
    ground: Object.freeze(['#5b7948', '#709052', '#8aa260']),
    grass: Object.freeze(['#7cab59', '#95bd69', '#b1d17d']),
    leaves: Object.freeze(['#70a941', '#8fbe52', '#b9d77a']),
    shrubs: Object.freeze(['#78a75e', '#92bc70', '#afd087']),
    fallen: Object.freeze(['#6d7436', '#817c3e']),
    sky: '#b9d7dc',
  }),
  summer: Object.freeze({
    ground: Object.freeze(['#536f43', '#68844e', '#80995b']),
    grass: Object.freeze(['#78a85a', '#91bb69', '#add07d']),
    leaves: Object.freeze(['#5f8f3f', '#719f48', '#95b864']),
    shrubs: Object.freeze(['#71975b', '#89ad69', '#a5c37c']),
    fallen: Object.freeze(['#7e6934', '#6f7733']),
    sky: '#abcbd5',
  }),
  autumn: Object.freeze({
    ground: Object.freeze(['#656847', '#7b7b50', '#91875b']),
    grass: Object.freeze(['#7f8853', '#969b60', '#aaa36d']),
    leaves: Object.freeze(['#8c3f20', '#c16a28', '#d69b37', '#7b5627']),
    shrubs: Object.freeze(['#899057', '#a49d61', '#bba96e']),
    fallen: Object.freeze(['#964923', '#c0762d', '#dfad4b']),
    sky: '#c7c1aa',
  }),
});

// Hero is the initial and reader framing; Explore has its own world overview.
export const CAMERA_VIEWS = Object.freeze({
  hero: Object.freeze({
    position: Object.freeze([15.5, 10.8, 17.5]),
    target: Object.freeze([0, 5.4, 0]),
  }),
  explore: Object.freeze({
    position: Object.freeze([10.222, 17.668, -31.367]),
    target: Object.freeze([-1.134, -2.247, 4.497]),
  }),
});
