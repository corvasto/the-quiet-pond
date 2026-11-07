export const UNDERGROUND_CONFIG = Object.freeze({
  floorY: -1.12,
  roofLimit: -0.28,
  cellSize: 0.65,
  // Height above the main tree's ground level, in world units. Lower hides more
  // trunk and branches in the map image; higher keeps more tall scenery.
  surfaceMapCutHeight: 5.8,
  // Surface image opacity: 0 = invisible, 1 = solid. 0.2 shows it at 20% opacity.
  // Lower values make the surface fainter; higher values make it more prominent.
  surfaceMapOpacity: 0.2,
  antRadius: 0.075,
  companionSpeed: 0.16,
  companionWanderRadius: 0.75,
  companionAnimationDistance: 4,
});
