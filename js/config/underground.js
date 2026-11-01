export const UNDERGROUND_CONFIG = Object.freeze({
  floorY: -5,
  ceilingY: -4.05,
  cellSize: 0.65,
  // Height above the main tree's ground level, in world units. Lower hides more
  // trunk and branches in the map image; higher keeps more tall scenery.
  surfaceMapCutHeight: 5.8,
  // Surface image opacity: 0 = invisible, 1 = solid. 0.2 shows it at 20% opacity.
  // Lower values make the surface fainter; higher values make it more prominent.
  surfaceMapOpacity: 0.2,
  entranceRadius: 1.05,
  antRadius: 0.075,
  camera: Object.freeze({
    distance: 1.1,
    minimumDistance: 0.3,
    maximumDistance: 2.4,
    height: 0.27,
    collisionRadius: 0.065,
    lookHeight: 0.11,
    framingDistance: 0.4,
    sweepStep: 0.045,
  }),
});
