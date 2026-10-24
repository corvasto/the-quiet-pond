# Seed to Burrow game mode

`index.html` opens the Pond world in Ant view.

See [controls.md](controls.md) for keyboard and touch input, and [configuration.md](configuration.md) for tuning.

## Movement and viewing

Use WASD, arrow keys, or the analog joystick to move relative to the view. Ground travel follows the requested direction independently of the ant's visual turn, with acceleration, braking, and normalized diagonals. The joystick supports 360-degree movement and proportional speed outside its deadzone. Contact validation and safe landing rules remain in place.

The elevated camera starts farther back for a wider view and gently turns behind sustained travel. It preserves zoom and pitch; dragging or zooming pauses assistance for 2.5 seconds. Drag to look around, use the wheel or a pinch to adjust distance, and press C or the camera reset button to restore behind-ant framing. Pause, Settings, About, focus loss, and view changes release held input.

## Current loop

1. The game starts in Ant view with the first of two three-seed batches.
2. Guide the ant with `W`, `A`, `S`, and `D` to any active seed. Each batch mixes collision-validated ground seeds with actual climbable rock-top and companion-tree branch anchors. Use `Space` to climb to elevated seeds. If a requested elevated anchor is unavailable, that seed falls back to ground instead of blocking progress.
3. Enter a seed's collection radius to pick it up automatically.
4. Carry it to the authored burrow entrance and enter the deposit radius.
5. Deposit all three active seeds to reveal the next batch, then repeat until all six are home.
6. Return to the burrow for the leaf offering, carry it to the pond, and enter the offering radius.
7. Complete optional checklist discoveries at the shelter, lamp, reader, radio, frog, cockroach, cat, fireflies, and lollipop at any pace.

The pause dialog contains resume/restart actions and three persistent local save slots. Settings contains English and Indonesian selection, soft feedback chimes, an optional realtime FPS diagnostic, Graphics quality, and access to About. Language selection updates UI prompts and radio announcements. The diagnostic shows actual rendered FPS at the bottom-right and turns red with a quality suggestion when performance is low. Checklist objectives are gentle and non-punitive; ignoring a weather or time objective does not cause damage or game over. After the final checklist objective, one completion caption is shown for 10 seconds. A completed lollipop remains eaten when its save is reloaded.

Use `P` or `Escape` to pause and `F` for fullscreen. Press `M` or choose `Explore` to enter a free orbit camera with the same pan and zoom behavior as the main diorama. While climb debug is enabled, hold `Shift` and left-drag in Explore to relocate the ant quickly. The burrow receives an Explore-only marker after the seed is collected.

## Object roaming

Use `W`, `A`, `S`, and `D` only for movement. Approach the hero ash or either companion tree, a ground or shoreline rock, the seated person, the radio, the corner lamp, or the tent from any direction. Pond rocks remain eligible down to `rock.minimumUsableRadius`, including rocks only slightly wider than the ant. When the ant's head enters the configured `activationDistance` around a valid low contact, the prompt names the target. Press `Space` to climb. Pressing a movement key, including strafing into an object with `D`, never triggers climbing by itself.

Entry is a hard cut from the ant's approximate head position to a verified low side contact. There is no interpolated climb arc that can pass through the ground. Each side ray begins a short distance behind the head and travels inward. Tree rays use several low heights and nearby approach angles because the procedural roots extend much farther than the trunk. Tree candidate detection uses a lower-wood triangle footprint built once at scene startup, so a visible root tip can activate the route without requiring the ant to approach the middle of the tree. Contacts never sample higher than `maximumEntryHeight` and are rejected when farther from the head than `maximumEntryCutDistance`. This prevents a nearby person from selecting a high book and prevents a distant rock from selecting its top. If a safe low contact is not found, `Space` leaves the ant on the ground.

After entry, `W`, `A`, `S`, and `D` provide free local roaming. Each proposed step must find a close contact in the target's allowed surface set and, for an instanced rock, the same rock instance. Tree roots guide forward movement toward the trunk only while the ant is low and outside the trunk radius. If a curved root loses its local forward contact, a small direction fan follows the exposed root inward. If the generated root mesh ends just short of the trunk, a bounded first-hit probe may bridge only to a closer exposed trunk contact. Tree entry returns the first fully valid low contact, reducing repeated pre-climb raycasts without changing its root coverage. Tree, reader, radio, lamp, and tent contacts are recast from the candidate normal toward only the same source mesh. A nearby outside hit can correct an inward sample to the near shell, while a large correction is rejected as an interior shortcut. Testing each mesh separately matters for the composite radio route because a rock hit must never validate a radio face. Reader contacts retain a small maximum contact-to-contact distance, preventing a probe from cutting across the body to a distant triangle. The lamp treats the sloped lower base as vertical traversal and uses a short inward ledge probe to join the central pole. Its upper route accepts exterior downward-facing triangles on the lamp housing, so the ant follows the underside instead of entering the model, can continue around the housing, and can reverse back down. The radio route is centered on the visible model's world bounds. A procedural support rock joins that route only when its footprint is actually near those bounds, and that accepted support is excluded from neighboring-rock rejection. When descending from the radio, a dedicated downward probe searches for an upward-facing support-rock contact outside the radio's lower footprint. Tent movement treats its sloped fabric as uphill traversal and uses a small direction fan to continue around the modeled entrance opening. Rock routes use wider probes, a larger crest snap range, and an extra forward-down probe so sharp transitions can continue onto the top. When rock footprints overlap, the controller casts down to the neighboring rock and rejects the proposed contact only when the neighboring mesh is actually above it. This blocks hidden lower surfaces without suppressing a valid top contact. A rejected step stops both movement and the walk animation. Press `Space` at any time to search outward from the ant's current side and land on the nearest ground position accepted by the ordinary collision system. The original entry point is used only if no current-side landing can be found. Existing ground collision checks resume after landing.

Ground movement uses startup footprints for the trees, lamp base, and tent. Each move sweeps intermediate samples instead of checking only the destination, which prevents narrow geometry from being skipped between frames. A recovery validator also searches the closest valid outside point if an ant position is ever found inside collision geometry. Its search distance expands for a large tent instead of assuming every blocker is tree-sized. Debug Explore relocation bypasses only the travel sweep, not destination validity, so its existing direct placement behavior remains available. The tent's configured `lift` is zero, grounding the normalized GLB base at its terrain anchor.

The seated person is much heavier than the other props. Its source model is about 655,000 triangles, so repeated gameplay raycasts against the original GLB cause severe frame drops. At scene build time, `model-surface-proxy.js` clusters nearby vertices in three dimensions, rebuilds the original indexed faces, and removes duplicate, collapsed, and tiny triangles. With the current settings, the actual asset produced about 6,221 vertices and 12,899 triangles in the offline verification. This follows the person, chair, and book surfaces instead of extruding vertical columns from the ground. Ground collision rasterizes only proxy triangles connected to the lower configured height, so legs and chair edges remain solid while elevated book and arm geometry do not block the ant from far away. Reader candidate distance derives from the model's actual bounds, and its proxy uses a forward-down transition probe. The visible GLB is unchanged and is never replaced in the rendered scene.

## Climb debug overlay

Overlay availability is controlled by the top-level `POND_GAME.debug` settings. Normal play starts with the overlay disabled. Because `allowToggle` is enabled, press `G` to toggle it without rebuilding the scene.

While debug is enabled, a top-left readout reports the ant's world-space `x`, `y`, and `z` coordinates to three decimal places. It samples at 10 Hz, reuses one vector, and changes the DOM only when the formatted coordinates change. The value remains correct during ground movement, climbing, flight, Explore, and debug relocation, making it suitable for copying positions into asset descriptors. The readout stops completely when debug is disabled.

Debug Explore relocation is available only while this overlay is enabled. Entering Explore while on an object suspends traversal and leaves the ant mounted. Debug relocation is available on the ground. Hold `Shift` and left-drag over the terrain to move the ant continuously, or use `Shift` and click for one relocation. The pointer ray targets the real terrain mesh. If a tree, rock, or seated-person collider blocks the exact point, the relocation searches outward and chooses the closest valid ground it can find. Water points use the current pond surface and retain ant ripples. Ordinary Explore drag, right-drag pan, and wheel zoom remain unchanged when `Shift` is not held.

While debug is enabled, press `Y` to toggle flight mode. Flight uses `WASD` at the configured 10x normal ant speed, `Space` to rise, and `Ctrl` to descend. The wireframe overlay is hidden during flight and restored when flight ends. Flight is intended for inspection and temporarily bypasses ground collision; disabling flight returns the ant to the nearest valid ground position when necessary. Change `DEBUG_CONFIG.flightSpeedMultiplier` in `js/config/world.js` to tune the speed.

- Green wireframe mask: potential surfaces supplied to the climb controller at startup.
- Yellow sphere and ring: approximate ant head and activation distance.
- Green segments: accepted low entry probes.
- Red segments: missed, unsafe, overly distant, or neighboring-rock entry probes.
- Cyan sphere: selected entry contact inside the debug overlay. The smaller pulsing cyan-blue gameplay marker remains available when debug is off.
- Purple segments: selected surface normal and tangent.
- Cyan line: the ant's actual trail while roaming on an object.

The cyan trail is the route already traveled. It is not a predicted path because the controller evaluates local mesh contact one movement step at a time.

The green mask shows potential climb surface, not a guaranteed global route. Local continuity, neighboring geometry, and landing validity can still reject a step. The mask is built only from enabled climb targets. Pond water is deliberately excluded, and ordinary water support and ripple behavior remain active.

The controller follows nearby mesh contacts rather than building a global navigation mesh. Small disconnected decorations, holes, and unreachable faces remain blocked intentionally.

## About and attributions

The localized About dialog is opened from Settings and includes a short source summary for Sketchfab GLB models, the YouTube Audio Library in YouTube Studio, Google AI Studio generated voices, and original work for The Quiet Pond. Its card scrolls as one surface on short viewports and resets to the heading whenever it opens. Closing About returns to Settings. This summary does not replace any individual model creator or license attribution required by a downloaded asset.

## Module boundaries

- `index.html` contains the game overlay, checklist, actions, touch controls, pause/save panel, Settings and About dialogs, loading state, and error message.
- `js/main.js` routes browser input, save slots, language selection, service-worker registration, and HUD updates.
- `js/game/game-session.js` starts the shared scene and joins the game modules.
- `js/config/game.js` composes focused content, radio, world, and climbing configuration from `js/config/`.
- `js/content/assets.js`, `messages.js`, and `objectives.js` define compile-once content metadata.
- `js/game/seed-to-burrow.js` owns seed discovery, carrying, offering pickup, offering carrying, and completion phases.
- `js/game/ant-climbing.js` handles hard-cut entry, contact validation, directional surface movement, and safe landing.
- `js/core/app.js` defines `PondApp`. Focused `js/core/app-*.js` modules implement world runtime capabilities.

`PondGameSession` creates `PondApp` in game mode with three data-only ground reservations, an expanded but habitat-bounded walk radius, the game start hour, and optional Ant-view follow-camera settings. Explore uses the world overview. The session supplies configuration as data; the world runtime does not import gameplay controllers.

## Tuning

Configure movement, camera, time, and weather in `js/config/world.js`; seeds and interactions in `js/config/content.js`; and traversal in `js/config/climbing.js`. `js/config/game.js` composes these values for the session and controllers.

Traversal tuning controls allowed surfaces, probe distances, contact continuity, speed, and landing search limits. Keep occupancy and contact validation enabled. Test trees, rocks, reader, radio, lamp, and tent after changing geometry or traversal settings. See [configuration.md](configuration.md) and [verification.md](verification.md).

## Carry behavior

The current ant animation is the already verified walk range. The asset does not have a separately verified carrying loop, so the seed remains a visual prop while the existing walk clip continues.
