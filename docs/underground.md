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

The four-unit ramp has a straight incline with short joins to the surface and room floors. Its floor uses eight sections instead of 64. It connects to the nest, store, root chamber, quiet chamber, and return loop. Adjacent rooms leave clearance around the upper ramp. Floor support includes the ramp-to-room seam and stays continuous during ascent. Surface height remains intact above the covered section.

The entrance camera locks along the passage when the ant enters the ramp, with manual rotation and zoom disabled. It faces inward or outward according to the ant's movement, retaining that direction while stopped. For a turn, it pulls closer, eases its yaw, then returns to its normal passage distance over 850 ms. Tunnel and rock clearance remain active throughout. The ant's body turns more gently on the ramp without changing walking speed. Camera handoffs preserve held movement, so approaching the exit from inside does not reverse walking. The camera aims at the ant's body to keep it visible on the slope. Normal controls return in the chambers. Reset view updates the requested underground orbit to face the ant forward; it does not start a surface camera tween. Wall corrections ease toward a safe position and compensate held movement using changes in the rendered camera heading. The camera never moves the ant.

Within 1.8 world units of the surface mouth, orbit remains available while zoom stays managed at the compact distance. The camera retains the requested orbit angle, shortens distance at rocks, and eases outward when clear. Input uses the same damping as normal outdoor orbit. The thinner roof leaves more room along the straight exit view. Reset view eases behind the ant's heading over 320 ms, preserving the current distance and pitch. Rock clearance can still shorten an obstructed view. A 55-degree entrance lens shows more of the passage. The passage view extends 0.55 units into the lower doorway so the handoff happens clear of its frame. After the ant clears the surface radius, a 750 ms eased orbit restores the normal outdoor Reset view, including distance, height, and lens. The transition follows the moving ant and preserves held movement direction. Orbit interpolation avoids zooming through the ant when the viewing direction changes. Walking back toward the mouth cancels the outdoor transition.

The central taproot keeps its brown color and receives a procedural bark bump map. The texture affects surface detail, not color, and requires no download. Root extension stays within its horizontal collision footprint. Underground material fill uses no point lights that could illuminate surface props.

The ramp and underground floors share a small procedural soil texture with soft, irregular patches and subtle grain. Smooth noise replaces the intersecting waves that formed a checker pattern, and bump strength is reduced. World-aligned UVs keep the grain size consistent. Mipmaps reduce distant shimmer; generation happens once and adds no geometry, draw calls, or downloads.

Rear side stones, a solid back wall, and an overlapping rock canopy enclose the burrow behind its front mouth. The entrance is concealed from behind. Surface walking and swept paths check the matching blockers before moving. Blocker correction ignores only actors actually below ground, so walking above the ramp cannot bypass the rocks. The rear wall sits beyond the terrain opening, with clearance for the underground passage and camera.

## Map, building, and saves

Explore becomes Map below ground. Tap it or press M for the tunnel plan, tapered ramp, position, heading, entrance, and surface reference. X, M, or Escape closes the dialog. Map pauses walking and canvas gestures. Soil between corridors at different floor heights is intentional.

Surface objectives, seed interactions, climbing, and surface audio pause below ground. The world clock continues. Materials, storage, recipes, and beds use the same underground layout and save data. Pickup checks include area and height. Drops validate the walking path separately from the full landing footprint.

Three companion ants roam the nest, store, and quiet chambers. They share the loaded ant model, stay within numeric floor clearance, pause with the game/map, and animate only near the player. Meeting them counts toward the existing companion objective. The cockroach can follow a collision-validated random path through the burrow mouth and along the underground floor; it does not seek the entrance or cross terrain from above.

Indoor manual orbit uses the same damping and rotation speed as the surface. A collision arm preserves the requested angle while shortening the distance at walls and easing outward when clear. It never selects another shoulder. Manual input is retained before collision correction, and movement compensation counts each orbit change once. The mouth and bottom doorway reserve the underground actor radius, and shallow soil edges also require headroom. Burrow rocks participate in the same ant visibility fade as other opaque scenery, keeping the ant visible after the outdoor camera return.

The chamber camera uses a 1.5-unit preferred distance with wall clearance. Rain, splashes and glare are hidden under shelter. Interior lighting, fog and stable exposure start blending only once both the ant and camera are below ground and one unit beyond the covered ramp rim. The blend spans the next 1.1 units and reverses smoothly on exit. The real outdoor sky remains visible through the entrance. Surface light intensity and weather state are restored after rendering. Stable indoor fill keeps the root texture visible. Covered underground shelter counts toward the rainy-shelter objective, while unrelated surface objectives remain suspended.

Checkpoints validate both tunnel cells and the entrance ramp. Valid ramp saves resume on the ramp rather than at the chamber spawn. Invalid positions fall back to the entrance. Existing save namespaces and inventory formats remain unchanged.

## Offline and verification

All runtime generation and map modules are pre-cached. No entry fade, deferred scene load, extra ant model, or separate underground camera controller is required.

Run `npm run check`, `npm test`, and `git diff --check`. Headless checks cover geometry, connectivity, complete exit walks, ramp checkpoint restoration, camera reset persistence, held input, map alignment, pickups, drop clearance, and resource cleanup.

Browser/device verification remains with the user. Test repeated entry and exit after restoring a save, Reset view and wall approaches, diagonal turning, leaf pickup/drop, map controls, root appearance, and Low/Mid/Full quality. Verify the release and offline behavior with the normal release workflow.
