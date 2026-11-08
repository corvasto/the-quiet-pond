<p align="center">
  <picture>
    <img src="./docs/screenshots/explore-mode.png" alt="explore mode" width="1080" style="border-radius: 10px;">
  </picture>
</p>

<h1 align="center">The Quiet Pond</h1>

<p align="center">
  <em>A cozy ant exploration game in a procedural pond world.</em>
</p>

<p align="center">
  <a href="https://github.com/corvasto/the-quiet-pond"><img src="https://img.shields.io/badge/Made_with-❤️-white?style=flat" alt="mwl" /></a>
  <a href="https://github.com/corvasto/the-quiet-pond/commits/main"><img src="https://img.shields.io/badge/version-v1.2.6-2b6cb0?style=flat-square" alt="version" /></a>
  <a href="https://github.com/corvasto/the-quiet-pond/actions/workflows/deploy-pages.yml"><img src="https://github.com/corvasto/the-quiet-pond/actions/workflows/deploy-pages.yml/badge.svg" alt="deploy-pages" /></a>
</p>

<p align="center">
  🌐 Play here: <a href="https://corvasto.github.io/the-quiet-pond/">https://corvasto.github.io/the-quiet-pond/</a>
</p>

---

<h2 align="center">Support</h1>
<p align="center">
  <em>If you or your kids enjoy playing around with this game, you can support its development here</em>
</p>

<p align="center">
  <a href="https://trakteer.id/corvasto_/tip"><img src="https://img.shields.io/badge/Trakteer-Support_Me-E9A020?style=for-the-badge&logo=caffeine&logoColor=white" alt="trakteer" /></a>
  <a href="https://ko-fi.com/corvasto"><img src="https://img.shields.io/badge/Ko--fi-Buy_me_a_coffee-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="ko-fi" /></a>
</p>

---

A cozy ant exploration game about a living pond. Collect discovery cards as you complete the checklist. Find seeds, climb through the scenery, and discover its daily routines and the ants living underground. A procedural pond with changing weather, a day/night cycle, radio music, English/Indonesian text, touch controls, three save slots, and offline play.

The Quiet Pond is a hobby project I'm making with my kids, with help from OpenAI Codex for coding and development. I also review and refine the code.

## Play from the source code

With Node.js installed and project dependencies installed, run this command from the project root:

```sh
npm run dev
```

Open the local URL printed in the terminal.

## Install on a phone

Open the HTTPS site (example from this repo: https://corvasto.github.io/the-quiet-pond) while online:

- **Android with Chrome:** Open the three-dot menu and tap **Install app** or **Install and create shortcut**, then confirm.
- **iPhone with Safari:** Tap **Share > Add to Home Screen**. If offered, turn on **Open as Web App**, then tap **Add**.

Load the game once online and let it finish caching for offline play. Menus vary by browser. See Google's [Android install guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en) and Apple's [iPhone Home Screen guide](https://support.apple.com/guide/iphone/bookmark-a-website-on-iphone-iph42ab2f3a7/ios).

## Controls

### Desktop

| Input | Action |
| --- | --- |
| WASD or arrow keys | Move relative to the view |
| Hold Shift | Run |
| Drag the scene | Look around |
| Wheel or pinch | Adjust camera distance |
| C | Reset the camera behind the ant |
| Space | Climb or get down |
| M | Toggle Explore |
| B or character switch | Fly as the bird after completing every objective, or return to the ant |
| E or Z button | Sleep until morning or night |
| P or Escape | Pause or resume |

### Mobile

- Drag the camera-relative joystick in any direction. Distance from the center controls speed, including on diagonals.
- Push the joystick toward its edge to run; ease it back to walk.
- Tap the arrow button to climb or get down.
- Tap **Zz** to sleep until morning or night wherever the ant is.
- Walk into the burrow to explore below ground and walk up the entrance ramp to leave. The climb button is hidden underground.
- Drag the scene to orbit while moving, as with keyboard movement. The ant keeps its current travel heading while you swipe. Pinch to adjust camera distance.

See [controls](docs/controls.md) and [gameplay](docs/gameplay.md) for camera behavior, traversal, and objectives.

Completing the checklist unlocks the playable bird. Flight has smooth curved steering, banking, object collision, and a minimum clearance above terrain and water. On mobile, use the joystick and look up/down to change altitude; The climb button is hidden while flying. The top character switch returns to the ant. `?debug=1` makes the bird available for testing before completing the checklist.

## Explore the pond

Gather seeds, deliver a leaf offering, and discover the pond's hidden details. Progress saves locally; saves and language preferences are tied to the site's origin. See [gameplay](docs/gameplay.md).

## Beneath the roots

The burrow opens onto one enclosed underground floor with light brown soil, contoured passages, low arched roofs, branching chambers, and a return loop around the surface tree's descending root. Building materials can be stored below and used for a leaf bed. Underground Explore becomes Map: a paused top-down tunnel plan with a red player marker, heading, exit, and a 20% top-down 3D surface reference. The image uses existing world assets and stays aligned during zoom/pan; simple pond/tree outlines are the fallback. Pinch or scroll to zoom and drag to pan. Close it with the X close button, M, or Escape.


The layout uses the same X/Z units as the pond and a lower floor height. Only the authored tunnel network is walkable; it does not fill the entire surface map. See [underground implementation and verification](docs/underground.md).

Walk into the burrow mouth at X -2.8, Z -3.84 to descend the covered entrance ramp. The underground shares the surface scene and the same ant. Walk back up the ramp to leave. Explore becomes Map below ground; tap it or press M for your position, heading, entrance, and surface reference. Saves resume on a validated tunnel or ramp position. The entrance camera is fixed along the passage; chamber controls resume afterward. Reset view faces the ant forward. Roots retain their brown color with procedural bark detail. Edge bumps and the nearby dip remain at X -12, Z -10 and X -10, Z -11.5. See [underground ownership and verification](docs/underground.md).

## Carry, store, and build

Use the contextual Pick up action near a seed or building material. Desktop F uses the primary action; mobile has the same visible button. Carry one object, drop it on clear dry ground, or bring a building leaf to the underground material store. Leaves and small sticks are scattered from the start. Store two leaves, choose a clear chamber floor, and confirm a two-leaf resting bed. Preview/cancel spends nothing. Storage, dropped materials, carried building leaves, and the bed persist in existing save slots. Carried seeds retain their original reload behavior. See [burrow building](docs/burrow-building.md) for controls, ownership, saves, and browser verification.

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
  ui/               Localization, debug overlay, controls, and relocation input
  utils/            Shared math, timing, noise, and motion helpers
styles/             Game interface styles
assets/             Models, audio, and other game assets
vendor/             Local Three.js runtime and license
scripts/            Project validation and headless tests
docs/               Architecture, tuning, content, and verification guides
build/release/      Generated minified production site (not committed)
```

## Configuration and architecture

Settings and quality profiles live in `js/config/`. Add `?q=full`, `?q=mid`, or `?q=low` to the URL to choose the browser startup profile. You can also change quality in the in-game Settings menu (Auto, Low, Mid, Full), alongside language, chimes, FPS diagnostics, and About. Auto selects Mid on mobile and Full elsewhere. All profiles use High Quality world generation; Full is uncapped, while Mid and Low target about 20 FPS. Applying settings and reloading saves progress. See [configuration](docs/configuration.md), [architecture](docs/architecture.md), [content framework](docs/content-framework.md), and [scene customization](docs/scene-customization.md).

Debug tools require `?debug=1`. Combine it with a startup profile, such as `?q=mid&debug=1`.

`js/ui/debug-overlay.js` owns the live readout and time preview controls. `js/ui/debug-controls.js` connects debug hints, checklist shortcuts, keyboard commands, and relocation input to the session's public actions. With the debug overlay active, select the Seeds checklist circle to finish seed collection and make the offering available. `js/main.js` keeps startup and top-level input routing; gameplay state stays in its controllers. See [architecture](docs/architecture.md) for ownership and cleanup.

Time preview in the debug overlay lets you apply any hour/minute, freeze the preview, and return to the game clock. The bird prepares on first selection and has no animation/physics frame callback or attached model during ant play.

## Development and verification

Run `npm run check` for syntax, imports, assets, localization, quality settings, release metadata, and cache coverage. Run `npm test` for movement, debug UI, and offline-shell tests. Run `npm run build:release` to generate the minified, compressed site in `build/release`, then `npm run check:release` to validate it. These commands do not start a server.

The optional Ant visibility window in Settings fades detected scenery between the camera and ant; it is off by default. Grass is divided into spatial batches so the renderer can skip batches outside the camera view. Ground collisions follow tree and rock mesh footprints at ant body height, with sliding around angled edges and validated climb landings. Tree climbing checks exposed bark locally and probes ahead at branch-to-trunk junctions; generated wood closes buried attachment ends for reliable solid collision checks. Touching rocks share climb surfaces, including the radio support cluster. Rendering, touch, collisions, performance, installation, and offline use need browser/device checks. See the [verification checklist](docs/verification.md) and [offline guide](docs/pwa.md).

## Credits

About has expandable model credits. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists asset sources and terms; [LICENSE](LICENSE) covers original project software only. Third-party assets retain their own licenses. Three.js has its own license in `vendor/three/LICENSE`.

Burrow gathering is available from the start: scattered leaves and sticks can be deposited for a two-leaf bed or a three-stick decorative frame. Material and recipe definitions are in `js/content/building.js`.

Settings > World > Ant trails enables short soil marks while walking on dry surface ground. Trails default to off and the choice persists on this device. Disabled trails allocate no geometry and register no frame listener. They fade after two seconds. Tune lifetime, spacing, size, and opacity in `js/config/ant-trail.js`; `js/game/ant-ground-trail.js` owns the fixed geometry pool and its cleanup. Trails are temporary and are not saved.
