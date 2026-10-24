# Architecture

## Startup and ownership

`index.html` loads `js/main.js`, which creates a `PondGameSession`, restores the selected save slot, connects input and interface events, and registers the versioned service worker.

The session creates `PondApp` with data-only world reservations, movement and camera settings, movement radius, and startup time. The runtime loads models, builds the deterministic pond, prepares collision proxies, and starts rendering. The session starts seeds, climbing, objectives, radio, and the day/weather cycle.

## Layers

| Directory | Responsibility |
| --- | --- |
| `js/config/` | Frozen application, world, quality, and gameplay settings |
| `js/content/` | Model descriptors, messages, and checklist definitions |
| `js/core/` | PondApp lifecycle, rendering, camera, actors, and world queries |
| `js/game/` | Progress, traversal, objectives, radio, and game session |
| `js/generators/` | Deterministic geometry and world layout |
| `js/props/` | Model loading, placement, animation, and surface proxies |
| `js/ui/` | Localized presentation helpers |
| `js/utils/` | Math, time, noise, and movement integration |

Core code never imports gameplay controllers. The session injects configuration through constructor options and connects controllers using public world queries and frame listeners. Generators accept explicit settings and return geometry, anchors, and query data.

## Configuration

`js/config/index.js` exports scene settings and builds `SCENE_PROPS` once from model descriptors and the selected quality profile. `js/config/game.js` composes the focused gameplay settings into `POND_GAME`.

The focused files keep different tuning tasks easy to find without duplicating values. Runtime modules consume prepared data rather than interpreting configuration on each frame. See [configuration.md](configuration.md).

## World runtime

`js/core/app.js` defines `PondApp`. Focused capability modules install its methods once during module initialization:

| Module | Responsibility |
| --- | --- |
| `app-ant-navigation.js` | Ground movement, swept collision, sliding, recovery, and flight |
| `app-camera.js` | Positional follow, orbit, camera reset, and Explore view |
| `app-actor-animation.js` | Ant, cat, and cockroach animation |
| `app-interactions.js` | Scene pointer and touch handling |
| `app-prop-placement.js` | Placement, lights, and colliders |
| `app-wanderers.js` | Background actors |
| `app-world-query.js` | Landmarks, surface queries, blockers, and frame listeners |

World construction selects model definitions, loads required assets in parallel, compiles reservations, generates terrain and vegetation, places props, and builds collision data. The habitat is constructed once during normal startup.

`PondApp.dispose()` releases event listeners, animation mixers, models, weather, rendering resources, controls, canvas, and the animation loop. The local Water add-on exposes disposal and render-target hooks for this lifecycle.

## Movement and camera

The session accepts keyboard directions and analog axes. Ground movement computes camera-relative target velocity with acceleration and braking; visible body rotation follows independently. Diagonals share the same maximum speed as straight movement. Swept path checks and water support validate travel.

Climbing follows bounded local surface contacts using precomputed proxies. Entry, transfer, and landing checks prevent unsafe steps. Camera tracking runs after gameplay frame listeners so it follows the final player position.

The camera follows position and gently aligns its horizontal orbit with sustained travel, preserving pitch and zoom. Manual orbit or zoom pauses assistance. C resets behind the ant, while Explore uses the world overview. Pause, focus loss, and view transitions release movement input.

## State and offline operation

`js/main.js` owns browser save slots and language preferences. Controllers serialize versioned progress data; the browser stores it under project-specific keys. Saving does not serialize render resources.

The service worker caches the complete game shell, import graph, models, and audio. It handles root/index navigation and restricts cache access to the app's scope and version. See [pwa.md](pwa.md).

## Verification

`npm run check` validates dependency paths, configuration, content, versions, and cache coverage. `npm test` exercises movement and offline request handling without a browser. Use [verification.md](verification.md) for rendering, input, traversal, and device checks.
