# Seed to Burrow game mode

`index.html` opens the Pond world in Ant view.

See [controls.md](controls.md) for keyboard and touch input, and [configuration.md](configuration.md) for tuning.

## Movement and viewing

WASD, arrows, or the analog joystick move relative to the view. Ground travel uses acceleration/braking, normalized diagonals, and body turning independent of direction; joystick speed scales outside its deadzone. Contact and safe-landing checks remain active.

The elevated camera starts wide and gently aligns behind sustained travel while preserving pitch/zoom. Drag or zoom pauses assist for 2.5 seconds; drag to look, wheel/pinch to zoom, and C/reset to return behind the ant. Pause, Settings, About, focus loss, and view changes release input.

## Current loop

1. Start in Ant view with the first of two seed batches.
2. Move to an active seed with `WASD`; each batch mixes collision-validated ground seeds with climbable rock tops and companion-tree branches. Use `Space` to climb. If an elevated anchor is unavailable, the seed falls back to validated ground.
3. Enter a seed's collection radius to pick it up automatically.
4. Carry it to the authored burrow entrance and enter the deposit radius.
5. Deposit all three active seeds to reveal the next batch, then repeat until all six are home.
6. Return to the burrow for the leaf offering, carry it to the pond, and enter the offering radius.
7. Discover the shelter, lamp, reader, radio, frog, cockroach, cat, fireflies, and lollipop at any pace.

Pause offers resume/restart and three persistent local slots. Settings has English/Indonesian, soft chimes, optional live FPS diagnostics, Graphics quality, and About. Language updates UI and radio; the bottom-right diagnostic reports rendered FPS and turns red with a quality suggestion when low. Checklist goals are optional; missed weather/time goals cause no damage or game over. The final caption lasts 10 seconds, and an eaten lollipop stays eaten after reload.

Press `P`/`Escape` to pause and `F` for fullscreen. `M`/Explore opens a free orbit camera with diorama pan/zoom. With climb debug enabled, `Shift`+left-drag in Explore relocates the ant; the burrow gets an Explore-only marker after seed pickup.

## Object roaming

Climbable targets are the hero ash, companion trees, ground/shoreline rocks, seated reader, radio, corner lamp, and tent. Rocks remain eligible down to `rock.minimumUsableRadius`, even barely wider than the ant. `Space` climbs when the ant's head is within `activationDistance` of a valid low contact; the prompt names the target. Movement or strafing never climbs by itself.

Entry snaps from the approximate head position to a verified low side contact, avoiding an interpolated arc through terrain. Side rays start just behind the head and point inward. Tree detection samples several low heights/angles and uses a startup-built lower-wood triangle footprint, allowing visible roots to activate climbing. Reject contacts above `maximumEntryHeight` or farther than `maximumEntryCutDistance`; this prevents selecting a high book/person or distant rock top. If no safe low contact exists, the ant stays grounded.

On objects, WASD roams locally. Each step must find a nearby contact on an allowed surface and, for rocks, the same instance. Tree, reader, radio, lamp, and tent contacts are recast from the candidate normal toward that source mesh only. Nearby outside hits may correct inward samples to the near shell; large corrections are rejected as shortcuts. A rock cannot validate a radio face. Reader contacts also enforce a short maximum gap to prevent crossing the body to a distant triangle.

Surface-specific routes:

- **Trees:** While the ant is low and outside the trunk radius, roots guide it toward the trunk. A direction fan follows curved roots; a bounded first-hit probe bridges a short root-to-trunk gap. Entry returns the first fully valid low contact, reducing repeated raycasts without reducing root coverage.
- **Lamp:** The sloped base counts as vertical traversal; a short inward ledge probe joins the pole. The upper route follows exterior downward-facing housing triangles, including around and back down the underside.
- **Radio:** The route follows visible model bounds. A support rock joins only when its footprint is near those bounds and is then excluded from neighboring-rock rejection. A dedicated downward probe finds upward-facing support beyond the radio's lower footprint when descending.
- **Tent:** Sloped fabric counts as uphill; a direction fan follows the modeled entrance opening.
- **Rocks:** Wider probes, larger crest snap, and a forward-down probe handle sharp top transitions. For overlapping rocks, reject contact only when the neighboring mesh is above it, blocking hidden lower surfaces while preserving valid tops.

A rejected step stops movement and walk animation. `Space` searches outward from the current side for the nearest ground accepted by normal collision checks; the entry point is fallback only. Ground collision resumes after landing.

Ground collision uses startup footprints for trees, lamp base, and tent, with swept samples to catch narrow geometry. Recovery searches the nearest valid outside point and expands for the larger tent. Explore relocation skips only the travel sweep, not destination validation. Tent `lift` is zero, grounding the normalized GLB at its terrain anchor.

The seated reader's source model has about 655,000 triangles, making direct gameplay raycasts costly. At startup, `model-surface-proxy.js` clusters 3D-near vertices, rebuilds indexed faces, and removes duplicate, collapsed, or tiny triangles. The verified proxy has about 6,221 vertices and 12,899 triangles. It follows person/chair/book surfaces rather than extruded ground columns. Ground collision rasterizes only proxy triangles connected to the configured lower height, keeping legs/chair edges solid without distant book/arm blockage. Candidate distance uses model bounds; the proxy uses a forward-down transition probe. The rendered GLB is unchanged.

## Climb debug overlay

Top-level `POND_GAME.debug` controls the overlay. It starts off; with `allowToggle`, press `G` to toggle without rebuilding.

When enabled, a top-left readout shows world `x/y/z` to three decimals at 10 Hz. It reuses a vector and updates the DOM only on value changes; coordinates remain accurate during ground travel, climbing, flight, Explore, and relocation for asset descriptors. It stops when debug is off.

Relocation requires the overlay and a grounded ant. Explore suspends traversal but leaves an object-mounted ant mounted. `Shift`+left-drag moves continuously; `Shift`+click relocates once. The ray targets actual terrain; if a tree, rock, or reader blocks it, search outward for nearest valid ground. Water uses the current pond surface and preserves ripples. Without Shift, normal orbit, right-drag pan, and wheel zoom remain unchanged.

Press `Y` for debug flight: WASD at configured 10x ant speed, Space up, Ctrl down. Flight hides the wireframe (restored afterward) and bypasses ground collision for inspection; when disabled, the ant returns to nearest valid ground if needed. Tune `DEBUG_CONFIG.flightSpeedMultiplier` in `js/config/world.js`.

| Overlay | Meaning |
| --- | --- |
| Green wireframe | Potential climb surfaces supplied at startup |
| Yellow sphere/ring | Approximate ant head and activation distance |
| Green segments | Accepted low-entry probes |
| Red segments | Missed, unsafe, distant, or neighboring-rock probes |
| Cyan sphere | Selected entry contact; smaller pulsing blue marker remains in normal play |
| Purple segments | Selected surface normal/tangent |
| Cyan line | Actual path traveled on an object |

The cyan trail shows traveled, not predicted, path: contacts are evaluated one step at a time. The green mask shows enabled potential surfaces, not guaranteed routes; continuity, neighboring geometry, or landing checks can reject steps. Water is excluded from climbing but keeps normal support/ripples. There is no global navmesh, so disconnected decorations, holes, and unreachable faces stay blocked.

## About and attributions

Settings opens the localized About dialog. It summarizes Sketchfab GLBs, YouTube Audio Library music, Google AI Studio voices, and original work. The card scrolls on short screens, resets to its heading on open, and returns to Settings when closed. This summary does not replace individual asset credits/licenses.

## Module boundaries

| Files | Responsibility |
| --- | --- |
| `index.html` | Overlay, checklist, actions, touch controls, pause/save, Settings/About, loading/errors |
| `js/main.js` | Browser input, saves, language, service worker, HUD |
| `js/game/game-session.js` | Shared scene startup and game-module wiring |
| `js/config/game.js` | Composes content, radio, world, and climbing settings |
| `js/content/assets.js`, `messages.js`, `objectives.js` | Compile-once content metadata |
| `js/game/seed-to-burrow.js` | Seed/offer phases and completion |
| `js/game/ant-climbing.js` | Entry, contact, surface motion, safe landing |
| `js/core/app.js`, `app-*.js` | `PondApp` and world capabilities |

In game mode, `PondGameSession` supplies three data-only ground reservations, a habitat-bounded expanded walk radius, start hour, and optional Ant-view camera settings. Explore uses the overview. Runtime receives settings as data and never imports gameplay controllers.

## Tuning

Tune movement/camera/time/weather in `js/config/world.js`, seeds/interactions in `content.js`, and traversal in `climbing.js`; `game.js` composes these values. Traversal settings cover surfaces, probes, contact continuity, speed, and landing limits. Keep occupancy/contact validation enabled; retest trees, rocks, reader, radio, lamp, and tent after changes. See [configuration.md](configuration.md) and [verification.md](verification.md).

## Carry behavior

The verified ant walk range plays while carrying; no carrying loop is verified, so the seed remains a visual prop.
