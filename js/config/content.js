import { getAssetDescriptor } from '../content/assets.js';

export const SEED_CONFIG = Object.freeze({
  // X and Z use world units. clearingRadius reserves vegetation around the seed anchor.
  position: Object.freeze({ x: 3.8, z: -2.8 }),
  clearingRadius: 0.3,
  // collectRadius controls interaction, while carryOffset is local to the ant attachment.
  collectRadius: 0.34,
  carryOffset: Object.freeze({ x: 0.048, y: 0.068, z: 0.042 }),
  // Change totalCount to add or remove collectible seeds. Spawn surfaces repeat
  // this pattern and stored positions are generated from their layout pattern.
  totalCount: 6,
  activeCount: 3,
  spawnSurfaces: Object.freeze({
    ground: true,
    water: false,
    rocks: true,
    branches: true,
  }),
  // Rock and branch candidates use verified surface anchors. A missing anchor
  // falls back to collision-validated ground instead of stalling a batch.
  spawnSurfacePattern: Object.freeze(['ground', 'rocks', 'branches']),
  storedSeedSlots: Object.freeze([
    Object.freeze({ x: -0.18, y: 0.055, z: -0.08 }),
    Object.freeze({ x: 0, y: 0.055, z: -0.12 }),
    Object.freeze({ x: 0.18, y: 0.055, z: -0.08 }),
    Object.freeze({ x: -0.1, y: 0.068, z: 0.12 }),
    Object.freeze({ x: 0.1, y: 0.068, z: 0.12 }),
    Object.freeze({ x: 0, y: 0.08, z: 0.27 }),
  ]),
  groundSpawnRadius: 11,
  // Smaller rocks are valid climb scenery but too cramped for a seed target.
  minimumRockRadius: 0.18,
  spawnHeightOffset: 0.055,
});

export const BURROW_CONFIG = Object.freeze({
  position: Object.freeze({ x: -2.8, z: -3.6 }),
  // clearingRadius reserves terrain detail, depositRadius completes delivery, and
  // shelterRadius is the smaller burrow-specific shelter interaction.
  clearingRadius: 0.88,
  depositRadius: 0.36,
  shelterRadius: 0.78,
});

export const OFFERING_CONFIG = Object.freeze({
  // Null means derive the offering from the generated pond center.
  position: null,
  depositRadius: 0.5,
  // This offset is local to the ant attachment, not a world-space placement.
  carryOffset: Object.freeze({ x: 0.04, y: 0.055, z: 0.035 }),
});

const lollipopAsset = getAssetDescriptor('lollipop');
const lollipopPlacement = lollipopAsset.placement;

const LOLLIPOP_CONFIG = Object.freeze({
  // Beside the northwest companion tree, away from the main-tree objectives.
  position: lollipopPlacement.position,
  clearingRadius: lollipopPlacement.clearingRadius,
});

export const OBJECTIVE_TUNING = Object.freeze({
  discoveryRadius: 1.15,
  readerBookRadius: 0.5,
  catRadius: 0.72,
  // Reader offset is model-local; lamp offset is added in world space to its glow position.
  readerBookOffset: Object.freeze({ x: 0, y: 1.0, z: 0.20 }),
  targetLampOffset: Object.freeze({ x: 0, y: 0.42, z: 0 }),
  lingerSeconds: 1.2,
  shelterRadius: 1.25,
  shelterPadding: 0.75,
  lampRadius: 0.5,
  companionAntRadius: 0.5,
  fireflies: Object.freeze({
    // A start later than end intentionally defines a window that wraps across midnight.
    startHour: 20,
    endHour: 6.5,
    surfaceTolerance: 0.12,
  }),
  // This world-space offset and tight radius target the inverted candy, not its stick.
  lollipopTargetOffset: lollipopAsset.runtime.objectiveOffset,
  lollipopRadius: 0.13,
  cockroachRadius: 0.24,
  // A wider meeting radius lets the ant greet this moving neighbor.
  cockroachMeetRadius: 0.6,
});

export const INTERACTION_CONFIG = Object.freeze({
  worldSpeechSeconds: 5,
  completionCaptionSeconds: 10,
  allObjectivesMessageKey: 'interaction.allObjectives',
  messageKeys: Object.freeze({
    frog: 'interaction.frog',
    cat: 'interaction.cat',
    reader: 'interaction.reader',
  }),
});

export const GAME_GROUND_RESERVATIONS = Object.freeze([
  Object.freeze({
    id: 'gameSeed',
    position: SEED_CONFIG.position,
    radius: SEED_CONFIG.clearingRadius,
  }),
  Object.freeze({
    id: 'gameBurrow',
    position: BURROW_CONFIG.position,
    radius: BURROW_CONFIG.clearingRadius,
  }),
  Object.freeze({
    id: 'lollipop',
    position: LOLLIPOP_CONFIG.position,
    radius: LOLLIPOP_CONFIG.clearingRadius,
  }),
]);
