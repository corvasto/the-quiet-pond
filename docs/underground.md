# Beneath the roots

Version 1.1.0 adds the burrow's first underground floor. Walk within the existing burrow interaction radius and press U or select Enter burrow. E and Sleep retain their above-ground sleep interaction. At the underground entrance, Return outside becomes available. Entry and exit share the sleep transition's fade style, with a separate overlay so sleep state is independent.

## Ownership

| File | Responsibility |
| --- | --- |
| `js/config/underground.js` | Floor height, passage cell size, player radius and camera limits |
| `js/content/underground-layout.js` | Connected floor plan, landmarks, worker paths, and numeric occupancy queries |
| `js/generators/underground.js` | Procedural soil, ceiling, roots, lights, and resource cleanup |
| `js/game/underground.js` | Separate scene/camera, player animation, movement, and camera collision |
| `js/game/game-session.js` | Deferred import, entry/exit routing, surface suspension, discovery persistence, and input routing |
| `js/ui/underground-map.js` | SVG map, surface image placement, and pinch/wheel/pan viewport |
| `js/utils/map-bounds.js` | Shared world bounds for SVG and orthographic image alignment |
| `js/core/surface-map.js` | One-shot surface rendering, pixel readback, and renderer/scene restoration |
| `js/main.js` | Button/key input, fade, loading progress, error feedback, and autosave |

`PondApp.setAlternateRuntime(runtime)` accepts an injected scene, camera, and update method. Its alternate frame branch bypasses surface simulation and camera updates while preserving the existing frame listeners for UI. Core does not import gameplay. Seeds, objectives, climbing, surface ambience/radio, and world time suspend during underground play. Exit restores the surface camera and controller state.

The player clone shares the existing ant model's mesh resources with a separate skeleton and mixer. The surface ant stays at its entrance position. Underground disposal releases procedural resources and controls without disposing shared surface meshes. The underground code has no inactive frame subscription.

## Layout and camera

One horizontal underground unit equals one surface unit. The layout is anchored to BURROW_CONFIG, with a lower contoured floor and a low arched ceiling. It contains an entry passage, central nest, seed store, root chamber, quiet chamber, and loop. This is a single floor without excavation or a full map overlay. The main taproot uses the surface tree's actual world X/Z position, with a solid root column and space to walk around it. Smaller roots branch across the chamber roof.

The walking camera uses a virtual orbit camera and a bounded sphere sweep against the earth, roof, and root. Its target height follows the contoured floor immediately. When a wall makes the requested orbit too close, bounded alternate yaw/height samples find a clear shoulder position. The ant stays visible; the camera never switches its model off. Player travel retains the shared surface movement and input-heading helpers, with interior collision constraints.

Underground Explore is now Map. It opens a native modal dialog and suspends travel, animation, and canvas gestures. The complete first floor is drawn from its live cell layout, with a red player marker and heading, gold entrance marker, structural root, and faint surface tree and exact pond shoreline. Every layer uses the same world X/Z coordinates. the X close button, M, or Escape closes the map; Map text, labels, and controls cannot be selected or long-press copied. The close button follows the existing dialog X styling. Native dialog focus containment prevents interaction with the game behind it. No map image or new model asset is downloaded. Pinch and wheel zoom between 100% and 600%; dragging pans. Mobile opens at 160% around the ant. The same SVG viewBox transforms every layer, preserving world scale. Pond points are sampled from the actual surface shoreline; the tree canopy circle and player/entrance markers are symbols rather than measured footprints. Surface Explore remains unchanged.

The entrance has a daylight opening in its end wall. Return outside appears within 1.05 world units of the entrance in walking mode. The same visible button works on desktop and mobile; U remains an optional desktop shortcut. The map marks the entrance and has a visible close button. Mobile exit placement leaves space for the touch hint and movement controls.

This stage contains the underground world and player only. Worker ants, seed piles, glowing caps, pale pebbles, circular nest fibers, entrance floor rings, and story triggers have been removed so the layout, camera, and lighting can be reviewed first. The structural tree root remains. Broad hemisphere fill, invisible room lights, and a soft camera light illuminate the light brown soil. Reloading resumes outside; re-entry starts at the underground entrance.

## Loading and offline

The four underground runtime modules are registered in ON_DEMAND_SHELL. Service-worker installation downloads APP_SHELL only. Entry dynamically imports the underground controller, generates the level, and shares the existing loading UI. Failed first loads leave the surface playable and show a retry message. Once entered online, deferred files cache for later visits. Updated app versions require their matching deferred files to be loaded again.

The production build uses ES module splitting. Startup and shared static dependencies stay in APP_SHELL; underground chunks stay in ON_DEMAND_SHELL. This prevents a dynamic import from being inlined into the first-play bundle. No additional media assets or voice recordings are needed for this version.

## Verification

Run npm run check, npm test, npm run build:release, npm run check:release, and git diff --check. Headless tests cover floor-plan connectivity, collision containment, worker routes, controller lifecycle, movement, camera obstruction, shared model ownership, and deferred offline requests.

Browser/device verification must be performed by the user. Check desktop and mobile, including Full as the visual reference:

- Enter with U and touch; confirm the fade/loading screen, daylight opening, and visible Return outside button on desktop and mobile.
- Open Map with M and touch. Confirm the red ant marker, heading, exit, and aligned surface tree/pond; movement stops, and the X close button, M, and Escape resume walking.
- Orbit and zoom near bends, corners, and slopes. Confirm the ant stays visible, the camera stays inside, and alternate shoulder positions feel comfortable.
- Move diagonally with the joystick while orbiting with another finger; pause/resume and reset the camera.
- Visit the chambers and check that only earth, structural roots, and the player are visible.
- Exit during day and rain; confirm surface camera, movement, sleep, seed loop, bird, and audio still work.
- Reload while inside; confirm safe surface resume.
- Enter online, wait for caching, then test entry offline. Test a fresh offline first entry and confirm readable failure and a playable surface.
- Inspect startup network requests in the release build to confirm the underground chunk waits until entry.


Underground wall boundaries meet the floor, roof, and adjacent wall at shared positions. Headless geometry checks require every earth-shell edge to have exactly two incident faces, covering corner seams and roof joins. Structural roots use curved, tapered meshes with capped ends; the central root remains inside its collision footprint.

Surface and underground controllers both call `resolveGroundDirection`, `trackGroundOrbit`, and `stepPlanarMotion` in `js/utils/player-motion.js`. This shares input-change handling, held-heading compensation during camera orbit, and acceleration/braking rather than copying separate heading logic. The underground camera shares surface follow responsiveness, orbit damping, rotation speed, and field of view; enclosed collision and pure-strafe camera behavior remain specific to the interior. Tests compare the actual surface and underground controllers frame by frame through input changes and manual camera orbit.


Underground roots clone the main surface tree's bark material and share its existing color, normal, and roughness maps. UVs wrap around each curved root and run along its length at the surface bark's repeat scale. The underground owns the cloned material and root geometry; the surface retains texture ownership, so exiting/disposal does not release its maps. This adds no texture download.


## Transparent surface reference

The map overlays a frozen top-down render of the existing surface scene at 20% opacity above the tunnel fills and below the labels/player marker. An orthographic camera uses exactly the same X/Z bounds as the SVG; smaller world Z is at the top. Pinch, pan, and wheel move the image and diagram together. Simple tree/pond outlines remain the fallback until capture succeeds.

Opening the map paints its controls and SVG first, then schedules a single render/readback. The image is reused for that underground visit and invalidated on the next entry. It uses existing geometry and textures, with no download. The capture uses a 512-pixel longest edge on small screens and 1024 on larger ones. Closing the map before capture starts cancels it.

Capture temporarily hides dense ash foliage, the surface player ant, weather/sky, and existing lights. Neutral fill/directional lighting makes the map readable independently of game time. The pond uses its actual surface mesh with a simple water material during capture, avoiding reflection renders. All visibility, water material/callback, fog/background, render target, viewport/scissor, clear settings, XR, and shadow enable state are restored in finally. Temporary targets/materials are disposed; PNG data is released when the interior is disposed or a new visit starts.

The dark entry/exit fade remains text-free. Its two 900 ms fades account for 1.8 seconds before any preparation cost. First entry retains the existing progress/loading screen while underground code loads and procedural geometry prepares; exiting and later entries reuse the prepared interior.

Headless checks verify orthographic corners, world Z/image orientation, common bounds, successful capture, restoration after render/readback/encoding failures, and temporary resource cleanup. Browser verification must confirm actual WebGL rendering, mobile capture delay, alignment with the pond/tree, 20% blending, pinch preservation while the image arrives, and unchanged surface lighting/water after exit.


The surface image is sliced by the orthographic camera's near plane, defaulting to 2 world units above the main tree's ground height. Set `surfaceMapCutHeight` in `js/config/underground.js` to adjust it. This clips high trunks and branches, including parts of meshes that cross the cutoff, without changing surface geometry/materials or global renderer clipping state. It affects the map image only; all scenery remains intact during gameplay.

Both overlay settings live in js/config/underground.js with inline comments: surfaceMapCutHeight sets the slice height relative to the tree ground level, and surfaceMapOpacity sets visibility from 0 (invisible) to 1 (solid). Reload after editing configuration. The opacity no longer needs a CSS change.
