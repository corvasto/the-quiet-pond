# Game configuration and performance

Reload code-level changes. Quality is selected at startup; the world is not rebuilt during play.

## Quality profiles

`js/config/quality.js` owns `QUALITY_PRESETS`. Choose Graphics quality in Settings and Apply and reload, or use `index.html?q=full`, `?q=mid`, or `?q=low`. Full is uncapped and highest quality; Mid targets 20 FPS with balanced cost; Low targets 20 FPS with the lightest workload. Selection order: valid URL `q`, saved `the-quiet-pond-quality`, then device default. Auto selects Mid on mobile and Full elsewhere. Applying saves the active slot and preference, updates/removes `q` while preserving other URL parameters, then reloads. Storage failure shows an error and keeps the current game.

## Debug URL switch

`js/config/world.js` owns `DEBUG_CONFIG`. Debug and G are off by default; only `?debug=1` enables startup diagnostics, G toggle, Explore relocation, objective markers, and radio tests. Missing, empty, zero, or other values disable it. The switch is not saved. Combine with quality as `?q=mid&debug=1`; remove it and reload for normal play. Checklist completion shortcuts remain unset.

| Value | Full | Mid | Low |
| --- | --- | --- | --- |
| Scene generation | High | High | High |
| Maximum pixel ratio | 1.75 | 1 | 0.7 |
| Shadow map size | 2048 | 512 | 128 |
| Ripple grid size | 128 | 64 | 36 |
| Frame interval | Uncapped | 1/20 second | 1/20 second |
| Background ants | Enabled | Enabled | Disabled |
| Decorative model flowers | Enabled | Enabled | Disabled |

All profiles retain antialiasing, cat, rain, reflection, ripples, shadows, leaf wind, and fireflies. Mid/Low reduce decoration and refresh costly effects less often; Full is the visual reference. Capped profiles target 20 FPS while motion remains frame-independent within a bounded simulation step.

The optional Settings diagnostic samples rendered FPS in 0.75-second windows and stores its preference as `the-quiet-pond-performance-diagnostic`. Its callback is subscribed only while enabled. Warnings start below 30 FPS in Full and 14 FPS in Mid/Low, which target 20 but commonly report about 18 after browser scheduling. A 2 FPS recovery margin prevents flicker; long hidden-tab gaps reset sampling to avoid false lows.

## Movement and camera

`js/config/world.js` owns movement and Ant camera settings; `js/config/game.js` composes them into `POND_GAME`. Settings enter the scene as data. While input is held, automatic yaw is excluded from movement heading to prevent orbit loops. Releasing/changing direction by over 0.15 radians, camera reset, or manual camera input clears this compensation. Assist is off during motion-locked climbing and debug flight.

Ground travel uses the camera's horizontal heading when movement starts or changes direction. Acceleration/braking use smoothing rates; turn speed affects body facing without bending the path. The mobile joystick moves 360 degrees with a central analog deadzone; joystick distance controls speed, including on diagonals. Manual camera orbit is compensated while movement is held, so swiping changes the view without steering the ant's current ground path.

The camera smooths positional follow and horizontal travel alignment. `assistEnabled` toggles assist; `assistDelay` defaults to 0.45 seconds, manual orbit/zoom pauses it for `assistResumeDelay` (2.5 seconds), `assistResponsiveness` sets easing, and `assistMaxSpeed` caps radians/second. It preserves pitch/zoom and stops with travel. Defaults: distance 1.5, height 0.85, max distance 3. C/reset restores behind-ant framing. `followFacing` is a separate, disabled direct-chase mode.

Keep the existing contact/path checks when tuning speed. Validate stopping near obstacles, pond support, surface transitions, and low-FPS behavior in the browser. See [controls.md](controls.md) and [verification.md](verification.md).

## Time and weather

`TIME_CONFIG` starts at 10:30 and advances one game hour per 120 seconds. `WEATHER_CONFIG` sets randomized dry/rain durations and intensity. `TIME_OF_DAY` in `js/config/scene.js` sets shared dawn/dusk boundaries; decimal 0 or 24 means midnight.

`DEFAULTS` sets deterministic seed, season, terrain/tree shape, wind, and environment. Habitat is fixed to Pond. `DEFAULTS.cameraFov` sets the gameplay lens (36 degrees). In `js/config/scene.js`, `CAMERA_VIEWS.explore.position` and `.target` set the Explore overview; the separate `hero` pose remains the initial and reader framing. With `?debug=1`, the debug overlay shows live camera position, target, and Euler orientation in degrees. Model transform defaults set game-prop scale and offset.

`ANT_LOCATOR` sets the Explore red beam/sphere colors, dimensions, opacity, pulse speed, and render order. It follows the ant on ground and climbs, and is hidden in Ant View.

## Content and traversal

| File | Settings |
| --- | --- |
| `js/config/content.js` | Seeds, burrow, offering, interaction radii, objective tuning |
| `js/config/climbing.js` | Enabled surfaces, entry/contact probes, local traversal and safe dismount |
| `js/config/radio.js` | Music, static, announcement files and timing |
| `js/content/assets.js` | GLB source, placement, size, degrees, animation, runtime role |
| `js/content/objectives.js` | Checklist definition and evaluator metadata |
| `js/content/messages.js` | Stable English and Indonesian message keys |

Six seeds appear in two batches of three. Candidate selection validates ground, rock tops, and companion-tree perches, falling back to validated ground if an elevated anchor is unavailable. `activeCount` sets batch size; `totalCount` sets completion. Compile ground reservations before details so vegetation respects fixed content.

Read [content-framework.md](content-framework.md) before adding assets or objectives. Every runtime addition needs a corresponding service-worker pre-cache entry. Keep `js/config/app.js`, package versions, and worker release aligned.
