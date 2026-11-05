# Beneath the roots

The underground is part of the surface world. Walk into the rounded burrow mouth at X -2.8, Z -3.84 and descend the covered passage. Walk back up to leave. The same ant, camera, and scene remain active throughout; there is no alternate-scene controller or mode flag.

## Ownership

- `js/config/content.js`: entrance dimensions, surface terrain features and root extension.
- `js/config/underground.js`: floor height, roof limit, cell size, actor clearance, and map reference tuning.
- `js/content/underground-layout.js`: chambers, corridors, root collision footprint, and occupancy queries.
- `js/generators/underground.js`: contoured earth, solid wall backing, roots, bark bump texture, and resource disposal.
- `js/generators/surface-chamber.js`: terrain opening, covered ramp, floor support, camera clearance, and vegetation cleanup.
- `js/core/app-ant-navigation.js` and `js/core/app-camera.js`: shared walking and camera behavior.
- `js/game/game-session.js`: startup, underground state, map, saves, and surface interaction suspension.
- `js/ui/underground-map.js` and `js/core/surface-map.js`: map dialog and one-shot surface reference.

## Walking and camera

The four-unit ramp connects to the nest, store, root chamber, quiet chamber, and return loop. Adjacent rooms leave clearance around the upper ramp. Floor support includes the ramp-to-room seam and stays continuous during ascent. Surface height remains intact above the covered section.

The entrance camera locks along the direction of travel when the ant enters the ramp, with rotation and zoom disabled. Camera handoffs preserve held movement, so approaching the exit from inside does not reverse walking. The camera aims at the ant's body to keep it visible on the slope. Normal controls return in the chambers. Reset view updates the requested underground orbit to face the ant forward; it does not start a surface camera tween. Wall corrections ease toward a safe position and compensate held movement using changes in the rendered camera heading. The camera never moves the ant.

At the surface exit, the passage camera stays active until the ant clears the mouth. A 750 ms eased orbit then restores the normal outdoor Reset view, including distance and height. The transition follows the moving ant and preserves held movement direction. Orbit interpolation avoids zooming through the ant when the viewing direction changes. Walking back into the ramp cancels the outdoor transition.

The central taproot keeps its brown color and receives a procedural bark bump map. The texture affects surface detail, not color, and requires no download. Root extension stays within its horizontal collision footprint. Underground material fill uses no point lights that could illuminate surface props.

## Map, building, and saves

Explore becomes Map below ground. Tap it or press M for the tunnel plan, tapered ramp, position, heading, entrance, and surface reference. X, M, or Escape closes the dialog. Map pauses walking and canvas gestures. Soil between corridors at different floor heights is intentional.

Surface objectives, seed interactions, climbing, and surface audio pause below ground. The world clock continues. Materials, storage, recipes, and beds use the same underground layout and save data. Pickup checks include area and height. Drops validate the walking path separately from the full landing footprint.

Checkpoints validate both tunnel cells and the entrance ramp. Valid ramp saves resume on the ramp rather than at the chamber spawn. Invalid positions fall back to the entrance. Existing save namespaces and inventory formats remain unchanged.

## Offline and verification

All runtime generation and map modules are pre-cached. No entry fade, deferred scene load, extra ant model, or separate underground camera controller is required.

Run `npm run check`, `npm test`, and `git diff --check`. Headless checks cover geometry, connectivity, complete exit walks, ramp checkpoint restoration, camera reset persistence, held input, map alignment, pickups, drop clearance, and resource cleanup.

Browser/device verification remains with the user. Test repeated entry and exit after restoring a save, Reset view and wall approaches, diagonal turning, leaf pickup/drop, map controls, root appearance, and Low/Mid/Full quality. Verify the release and offline behavior with the normal release workflow.
