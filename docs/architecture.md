# Architecture

## Startup and ownership

`index.html` loads `js/main.js`, which restores the selected save, wires input and UI, registers the versioned service worker, and creates `PondGameSession`. The session constructs `PondApp` with data-only reservations, movement/camera settings, walk radius, and start time. The runtime loads models, builds the deterministic pond and collision proxies, then renders; the session starts seeds, climbing, objectives, radio, and day/weather.

## Layers

| Directory | Responsibility |
| --- | --- |
| `js/config/` | Frozen application, world, quality, and gameplay settings |
| `js/content/` | Model descriptors, messages, and checklist definitions |
| `js/core/` | PondApp lifecycle, rendering, camera, actors, and world queries |
| `js/game/` | Progress, traversal, objectives, radio, and game session |
| `js/generators/` | Deterministic geometry and world layout |
| `js/props/` | Model loading, placement, animation, and surface proxies |
| `js/ui/` | Localization, debug presentation, and debug control adapters |
| `js/utils/` | Math, time, noise, and movement integration |

Core never imports gameplay controllers. The session injects settings and connects controllers through public world queries and frame listeners. Generators accept explicit settings and return geometry, anchors, and query data.

## Configuration

`js/config/index.js` builds `SCENE_PROPS` once from model descriptors and the selected quality profile; `js/config/game.js` composes focused settings into `POND_GAME`. Runtime modules consume prepared data, not configuration interpreted each frame. See [configuration.md](configuration.md).

## World runtime

`js/core/app.js` defines `PondApp`; focused modules install its capabilities once at initialization:

| Module | Responsibility |
| --- | --- |
| `app-ant-navigation.js` | Ground movement, swept collision, sliding, recovery, and flight |
| `app-camera.js` | Positional follow, orbit, camera reset, and Explore view |
| `app-actor-animation.js` | Ant, cat, and cockroach animation |
| `app-interactions.js` | Scene pointer and touch handling |
| `app-prop-placement.js` | Placement, lights, and colliders |
| `app-wanderers.js` | Background actors |
| `app-world-query.js` | Landmarks, surface queries, blockers, and frame listeners |
| `flight-collision.js` | Cached capsule/triangle BVH, sphere collision, and swept flight movement |

Startup selects models, loads required assets in parallel, compiles reservations, generates terrain/vegetation, places props, and builds collision data once. `PondApp.dispose()` releases listeners, mixers, models, weather/render resources, controls, canvas, and the animation loop. The local Water add-on provides disposal and render-target hooks.

Model descriptors with `loadOnDemand` skip startup loading. `PondApp.loadDeferredModel()` shares in-flight requests, caches the loaded model, and disposes late results if the app has closed. The bird prepares only on first selection, subscribes to frames only while active and unpaused, and detaches its scene objects during ant play. Explore runs animation only while preserving its position and the free camera. Tree collision tapers with branch radii; local collars use dimensions recorded by the wood generator, without widening entire branches. Movement candidates follow minimum terrain clearance before solid collision checks.

## Movement and camera

Keyboard and analog input drive camera-relative ground motion with acceleration/braking, normalized diagonals, and independent body turning. Swept checks and water support validate travel. Climbing uses bounded contacts on precomputed proxies; entry, transfer, and landing checks reject unsafe steps. Camera tracking runs after gameplay listeners, follows final position, and gently aligns with sustained travel while preserving pitch/zoom. Manual orbit or zoom pauses assist; C resets behind the ant, Explore uses the overview, and pause/focus/view changes release input.

`js/game/bird-flight.js` owns the playable reward lifecycle, animation, inputs, camera following, and collision queries. It receives tuning through the session and uses public runtime methods to acquire solid collision sources and set its camera. `js/utils/flight-motion.js` integrates capped turns and smoothed speeds in bounded steps. Collision geometry is collected once from tree wood, rocks, solid models, and the burrow; the moving reader uses the runtime's updated bounds. Session routing suspends ant gameplay during bird control and preserves mounted climb state for the return switch. Saved objective completion restores the unlock; flight itself is not restored across reloads.

## State and offline operation

`js/main.js` owns save slots and language preferences. Controllers serialize versioned progress to project-specific browser keys, not render resources. The service worker caches the shell, imports, models, and audio; it handles root/index navigation and limits cache access to this app's scope/version. See [pwa.md](pwa.md).

## Verification

`npm run check` validates dependency paths, settings, content, versions, and cache coverage. `npm test` exercises movement and offline requests headlessly. Use [verification.md](verification.md) for visual, input, traversal, and device checks.

## Debug UI ownership

`js/main.js` creates the debug UI, passes session/time/translation accessors and HUD callbacks, routes keyboard events after dialog and editable-target checks, and forwards readiness. Startup attaches canvas input; unload and startup failure dispose the UI. Normal movement, bird switching, pause, and save handling remain in main and the session.

| Module | Responsibility |
| --- | --- |
| `js/ui/debug-overlay.js` | Ant/bird and camera readouts, 100 ms polling, and time preview inputs |
| `js/ui/debug-controls.js` | Debug hints, checklist completion buttons, G/Y/R/V/T command dispatch, and overlay/relocation lifecycle |
| `js/ui/debug-relocation.js` | Shift-click/drag canvas pointer ownership and relocation listener cleanup |

The UI calls public session methods; gameplay actions and their guards stay in `js/game/` controllers. Time preview does not alter the saved clock, while checklist shortcuts follow the existing autosave path. The Seeds checklist shortcut makes the offering available through the seed controller. Core never imports game or UI modules. The readout starts only after startup with debug enabled, runs at 10 Hz without a frame subscription, writes changed values only, and stops when G hides it or the UI is disposed. Disposal also removes time preview and relocation listeners. Both new UI modules are in the service-worker pre-cache and are bundled into the production release.
