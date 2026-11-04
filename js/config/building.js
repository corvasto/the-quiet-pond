export const BUILDING_CONFIG = Object.freeze({
  leafCount: 18,
  stickCount: 12,
  stickRadius: 0.16,
  scatter: Object.freeze({ radius: 12, minimumSpacing: 1.4 }),
  pickupRadius: 0.32,
  interactionRadius: 0.65,
  dropDistance: 0.32,
  leafRadius: 0.14,
  bedRadius: 0.34,
  // Footprint plus an ant-width walking margin, rather than a whole empty chamber.
  bedClearance: 0.52,
  bedCost: 2,
  maximumSlope: 0.3,
  leafCarry: Object.freeze({
    // Authored head joint and mandible-center offset in ant.glb's native units.
    headBone: 'ant_033',
    mouthOffset: Object.freeze({ x: 145, y: -68, z: 0 }),
    // Fallback is in world units for actors without the authored skeleton.
    fallback: Object.freeze({ x: 0, y: 0.025, z: 0.055 }),
    pitch: -0.45,
  }),
});
