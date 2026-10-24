# Game configuration and performance

Reload after changing code-level settings. Quality is chosen once at startup; the generated world is not rebuilt during ordinary play.

## Quality profiles

`js/config/quality.js` owns `QUALITY_PRESETS`. Use the Settings menu's Graphics quality selector and Apply and reload, or open `index.html?q=full`, `?q=mid`, or `?q=low`. The option labels identify the expected cadence and rendering tradeoff: Full is uncapped with the best visuals, Mid targets about 20 FPS with balanced rendering, and Low targets about 20 FPS with the lightest workload. Selection precedence is valid URL `q`, saved `the-quiet-pond-quality` preference, then device default. Auto chooses mid for mobile and full otherwise. Applying a menu choice saves the active slot before reloading, stores the preference, and updates `q` (removes it for Auto), preserving other URL parameters. If browser storage fails, the app shows an error and stays in the current game.

## Debug URL switch

`js/config/world.js` owns `DEBUG_CONFIG`. Debug and its G toggle are disabled by default. Only `?debug=1` enables diagnostics at startup, the toggle, Explore relocation, objective markers, and radio test controls. Missing, empty, zero, and other values leave debug disabled. The switch is not stored. Use `?q=mid&debug=1` to combine quality and debug; remove the switch and reload for normal play. Checklist completion shortcuts remain unset.

| Value | Full | Mid | Low |
| --- | --- | --- | --- |
| Scene generation | High | High | High |
| Maximum pixel ratio | 1.75 | 1 | 0.7 |
| Shadow map size | 2048 | 512 | 128 |
| Ripple grid size | 128 | 64 | 36 |
| Frame interval | Uncapped | 1/20 second | 1/20 second |
| Background ants | Enabled | Enabled | Disabled |
| Decorative model flowers | Enabled | Enabled | Disabled |

All retain antialiasing, the cat, rain, reflection, ripples, shadows, leaf wind, and fireflies. Mid/low reduce decorative density and refresh costly effects less often. Full remains the visual reference. Mid and low limit rendering to about 20 FPS; player motion uses frame-independent smoothing within the bounded simulation step.

The optional Performance diagnostic in Settings measures rendered frames in 0.75-second windows and is stored under `the-quiet-pond-performance-diagnostic`. Its frame callback is subscribed only while the setting is enabled, so the sampler performs no per-frame work while hidden. Full quality warns below 30 FPS. Mid and Low warn below 14 FPS because both intentionally target about 20 FPS and commonly report around 18 FPS after browser frame scheduling. A 2 FPS recovery margin prevents the warning from flickering near its threshold while allowing normal capped rendering to recover to green. Long hidden-tab gaps reset sampling instead of producing a false low result.

## Movement and camera

Automatic camera yaw is excluded from the movement heading while an input direction is held, preventing backward and sideways orbit loops. Releasing input, changing its angle by more than 0.15 radians, resetting the camera, or starting manual camera input clears this compensation. Assistance is disabled during motion-locked climbing and debug flight.

`js/config/world.js` owns movement and Ant camera configuration, composed into `POND_GAME` by `js/config/game.js`. Settings are data-only inputs to the scene engine.

Ground travel is relative to the current camera heading. Acceleration and braking use smoothing rates; visual turn speed changes how quickly the body faces movement without bending the requested path. The analog deadzone suppresses tiny joystick displacement and the remaining range scales continuously to full speed. Diagonal and combined inputs cannot exceed the same maximum magnitude as a single direction.

The gameplay camera uses positional smoothing with gentle travel assistance. `assistEnabled` enables horizontal alignment after `assistDelay` seconds of travel (0.45 by default). Manual orbit or zoom pauses it for `assistResumeDelay` seconds (2.5). `assistResponsiveness` controls easing and `assistMaxSpeed` caps turning in radians per second. Assistance preserves pitch and zoom and stops when travel stops. The default distance is 1.5, height is 0.85, and maximum zoom distance is 3. C or the reset camera button restores behind-ant framing explicitly. `followFacing` remains disabled; it is the separate direct chase behavior.

Keep the existing contact/path checks when tuning speed. Validate stopping near obstacles, pond support, surface transitions, and low-FPS behavior in the browser. See [controls.md](controls.md) and [verification.md](verification.md).

## Time and weather

`TIME_CONFIG` starts at 10:30 and advances one game hour per 120 real seconds. `WEATHER_CONFIG` controls randomized dry/rain durations and intensity. `TIME_OF_DAY` in `js/config/scene.js` provides shared dawn/dusk boundaries. Decimal hours use 0 or 24 for midnight.

`DEFAULTS` sets the deterministic seed, season, terrain/tree shape, wind, and environment. The fixed habitat is Pond. DEFAULTS.cameraFov controls the gameplay lens (36 degrees). The hero camera pose defines the Explore overview. Model transform defaults provide scale and offset values for game prop placement.

`ANT_LOCATOR` controls the red locator beam and glowing sphere shown around the ant in Explore View. It defines their colors, dimensions, opacity, pulse speed, and render order. The locator follows the ant on the ground and while climbing, and is hidden in Ant View.

## Content and traversal

| File | Settings |
| --- | --- |
| `js/config/content.js` | Seeds, burrow, offering, interaction radii, objective tuning |
| `js/config/climbing.js` | Enabled surfaces, entry/contact probes, local traversal and safe dismount |
| `js/config/radio.js` | Music, static, announcement files and timing |
| `js/content/assets.js` | GLB source, placement, size, degrees, animation, runtime role |
| `js/content/objectives.js` | Checklist definition and evaluator metadata |
| `js/content/messages.js` | Stable English and Indonesian message keys |

The six seeds form two batches of three. Candidate selection keeps ground, rock-top, and companion-tree perch safety checks and falls back to validated ground if the preferred elevated anchor is unavailable. `activeCount` is batch size; `totalCount` determines completion. Ground reservations compile before world detail so vegetation respects fixed content.

Read [content-framework.md](content-framework.md) before adding assets or objectives. Every runtime addition needs a corresponding service-worker pre-cache entry. Keep `js/config/app.js`, package versions, and worker release aligned.
