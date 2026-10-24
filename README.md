# The Quiet Pond

A cozy exploration game about an ant and the small, living world around a pond. Find seeds, carry them home, climb through the scenery, and discover the pond's daily routines at your own pace.

The world is generated with Three.js and includes changing weather, a day/night cycle, radio music, English and Indonesian text, touch controls, three save slots, and offline play.

The Quiet Pond is a hobby project I’m making with my kids, with help from OpenAI Codex for coding and development.

## Play

Serve the project folder with a static HTTP server, then open `index.html` or the folder root. Browser modules, models, and audio require HTTP; opening the file directly will not work.

Three.js 0.184.0 and its required add-ons are included under `vendor/three/`. No package installation or CDN is required to play.

## Controls

| Input | Action |
| --- | --- |
| WASD or arrow keys | Move relative to the view |
| Hold Shift | Run |
| Drag the scene | Look around |
| Wheel or pinch | Adjust camera distance |
| C | Reset the camera behind the ant |
| Space | Climb or get down |
| M | Toggle Explore |
| P or Escape | Pause or resume |
| F | Fullscreen |

On touch screens, use the larger joystick to move. Hold A on the left to run; tap B above and to the right for the climb/get-down action. The controls sit above the bottom edge with extra clearance in portrait and landscape. Joystick distance controls walking speed. Movement follows the current view: up travels away from the camera, down toward it, and left/right across the view. Rotating the camera updates this mapping immediately, including on walkable climbing surfaces. Automatic camera turning stays off when using the joystick; positional camera follow remains active.

The default camera is elevated and pulled back for a wider view. Sustained movement gently turns the camera behind your direction of travel while preserving zoom and pitch. Dragging or zooming pauses assistance for 2.5 seconds; stopping movement stops automatic turning.

Holding a keyboard movement direction keeps travel steady while the camera assists. Release or change keyboard direction to steer relative to the current view. The touch joystick always uses the current view. Automatic turning is disabled for joystick input, climbing, and debug flight.

See [controls](docs/controls.md) for input details and [gameplay](docs/gameplay.md) for traversal and objectives.

## Explore the pond

Bring six seeds home in two batches of three, then carry a leaf offering to the pond. The checklist also tracks discoveries at the shelter, lamp, reader, radio, frog, cat, fireflies, and lollipop.

Progress saves automatically to the selected slot. Pause to manage three save slots or start a new game. Saves and language preferences are stored in the browser and belong to the site's origin.

The checklist has 11 objectives, including meeting a wandering cockroach. Stay within 0.6 world units of it for 1.2 seconds to complete the objective.

## Project structure

```text
index.html          Game page
js/
  main.js           Startup, interface, browser input, and saves
  config/           Application, world, rendering, and gameplay settings
  content/          Models, localized messages, and objective definitions
  core/             PondApp, rendering, actors, camera, and world queries
  game/             Session, objectives, seeds, climbing, and audio
  generators/       Procedural terrain, vegetation, rocks, and water
  props/            Model loading, animation, placement, and collision proxies
  ui/               Text presentation helpers
  utils/            Shared math, timing, noise, and motion helpers
styles/             Game interface styles
assets/             Models, audio, and other game assets
vendor/             Local Three.js runtime and license
scripts/            Project validation and headless tests
docs/               Architecture, tuning, content, and verification guides
```

## Configuration

All settings live in `js/config/`.

| File | Purpose |
| --- | --- |
| `app.js` | Application identity, version, and cache prefix |
| `quality.js` | Rendering profiles and device selection |
| `scene.js` | Procedural world, environment, and Explore view |
| `world.js` | Player movement, follow camera, time, weather, and debug |
| `content.js` | Seeds, burrow, offering, and objective tuning |
| `climbing.js` | Surface contact, traversal, and landing rules |
| `radio.js` | Music, announcements, and audio timing |
| `game.js` | Composed gameplay settings |
| `index.js` | Scene settings and compiled model configuration |

Use `index.html?q=full`, `?q=mid`, or `?q=low` to select a profile at startup. Every profile uses High Quality world generation. Full renders at the available frame rate; mid and low target about 20 FPS with reduced rendering cost and decorative density.

In Settings, choose Graphics quality (Auto, Low, Mid, or Full), then Apply and reload. Progress is saved before reloading and the preference is remembered in browser storage. Auto chooses Mid on mobile and Full elsewhere. An explicit `q` URL overrides the saved preference; applying a menu choice updates that URL override. Settings also contains Language, soft feedback chimes, an optional realtime FPS diagnostic, and About. Pause remains focused on resuming, restarting, and save-slot management.

Dialog actions use comfortable touch targets. Focus outlines follow keyboard input, and hover highlights are limited to hover-capable pointers to avoid lingering highlights on phones.

Debug is disabled by default, including its keyboard toggle. Open `index.html?debug=1` to enable diagnostics, flight, relocation, and radio test controls. Combine switches with `index.html?q=mid&debug=1`. Remove `debug` or use `debug=0` and reload to disable it.

See [configuration](docs/configuration.md), [architecture](docs/architecture.md), [content framework](docs/content-framework.md), and [scene customization](docs/scene-customization.md).

## Development and verification

Run `npm run check` for syntax, imports, assets, localization, quality settings, release metadata, and cache coverage. Run `npm test` for movement and offline-shell tests. These commands do not start a server.

Rendering, touch interaction, collision feel, performance, installation, and offline behavior also need browser/device verification. Use the [verification checklist](docs/verification.md) and [offline guide](docs/pwa.md).

## Credits

The About dialog includes expandable credits for the 3D models. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full model source and license list, and [LICENSE](LICENSE) for the project software license. The software license does not replace the separate terms for bundled assets. Three.js is distributed under its own license in `vendor/three/LICENSE`.
