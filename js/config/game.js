import { CLIMBING_CONFIG } from './climbing.js';
import {
  BURROW_CONFIG,
  GAME_GROUND_RESERVATIONS,
  INTERACTION_CONFIG,
  OBJECTIVE_TUNING,
  OFFERING_CONFIG,
  SEED_CONFIG,
} from './content.js';
import { RADIO_AUDIO_CONFIG } from './radio.js';
import {
  ANT_CAMERA_FOLLOW_CONFIG,
  ANT_MOVEMENT_CONFIG,
  ANT_MOVEMENT_RADIUS,
  DEBUG_CONFIG,
  TIME_CONFIG,
  WEATHER_CONFIG,
} from './world.js';

// Composes the configuration consumed by gameplay systems.
export const POND_GAME = Object.freeze({
  seed: SEED_CONFIG,
  burrow: BURROW_CONFIG,
  offering: OFFERING_CONFIG,
  objectives: OBJECTIVE_TUNING,
  interactions: INTERACTION_CONFIG,
  radioAudio: RADIO_AUDIO_CONFIG,
  time: TIME_CONFIG,
  weather: WEATHER_CONFIG,
  debug: DEBUG_CONFIG,
  antCameraFollow: ANT_CAMERA_FOLLOW_CONFIG,
  antMovement: ANT_MOVEMENT_CONFIG,
  antMovementRadius: ANT_MOVEMENT_RADIUS,
  groundReservations: GAME_GROUND_RESERVATIONS,
  climbing: CLIMBING_CONFIG,
});
