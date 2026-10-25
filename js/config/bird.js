export const BIRD_FLIGHT_CONFIG = Object.freeze({
  speed: 3.4,
  climbSpeed: 2.4,
  acceleration: 3.5,
  braking: 5,
  turnResponsiveness: 5,
  maximumTurnRate: 1.8,
  bankAngle: 0.45,
  analogDeadzone: 0.12,
  collisionRadiusScale: 0.65,
  // Measured from the bottom of the collision sphere to terrain or water.
  minimumGroundClearance: 2,
  maximumAltitude: 28,
  spawnClearance: 1,
  simulationStep: 1 / 60,
  camera: Object.freeze({
    distance: 3.2,
    height: 1.1,
    minimumDistance: 1.4,
    maximumDistance: 8,
    followResponsiveness: 12,
  }),
});
