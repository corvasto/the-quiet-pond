export const TIME_CONFIG = Object.freeze({
  enabled: true,
  // Decimal 24-hour game time. Both 0 and 24 mean midnight; 5.5 means 05:30.
  startHour: 10.5,
  // Real seconds required for one game hour. One real second advances one game minute.
  secondsPerGameHour: 60,
});

export const WEATHER_CONFIG = Object.freeze({
  enabled: true,
  rain: Object.freeze({
    // Durations are real seconds. Intensity values are normalized from 0 to 1.
    minimumDrySeconds: 90,
    maximumDrySeconds: 210,
    minimumRainSeconds: 35,
    maximumRainSeconds: 95,
    minimumIntensity: 0.32,
    maximumIntensity: 0.82,
  }),
});

export function requestedDebugMode(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('debug') === '1';
}

const DEBUG_ENABLED = requestedDebugMode();

export const DEBUG_CONFIG = Object.freeze({
  // Debug tools are opt-in for this URL only: ?debug=1.
  enabled: DEBUG_ENABLED,
  allowToggle: DEBUG_ENABLED,
  // Multiplies the ant's normal movement speed while debug flight is active.
  flightSpeedMultiplier: 10,
  allowExploreRelocation: DEBUG_ENABLED,
  allowRadioControls: DEBUG_ENABLED,
  showObjectiveMarkers: DEBUG_ENABLED,
  // Set to an objective id such as 'frog' to mark every other checklist task complete.
  // Set back to null for normal play.
  completeChecklistExcept: null,
});

export const ANT_CAMERA_FOLLOW_CONFIG = Object.freeze({
  // Follow position and gently align with sustained travel, preserving zoom and pitch.
  enabled: true,
  followFacing: false,
  assistEnabled: true,
  assistDelay: 0.45,
  assistResumeDelay: 2.5,
  assistResponsiveness: 1.2,
  assistMaxSpeed: 0.8,
  // Distance and height set the elevated view on entry or camera reset.
  distance: 1.5,
  height: 0.48,
  lookAhead: 0,
  responsiveness: 16,
  orbitResponsiveness: 10,
  rotateSpeed: 0.7,
  enableZoom: true,
  minDistance: 0.45,
  maxDistance: 3,
});

export const ANT_MOVEMENT_CONFIG = Object.freeze({
  // Rates are per second. Braking also makes direction reversals responsive.
  acceleration: 18,
  braking: 26,
  turnResponsiveness: 18,
  analogDeadzone: 0.12,
});

// Maximum ground movement distance in world units from the habitat center.
export const ANT_MOVEMENT_RADIUS = 24;
