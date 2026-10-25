# Game controls

## Play

| Input | Result |
| --- | --- |
| WASD or arrow keys | Move relative to the view, including diagonals |
| Hold Shift | Run on the ground |
| Left drag on the scene | Orbit the gameplay camera |
| Wheel or pinch | Adjust gameplay camera distance |
| C or camera reset button | Restore the elevated view behind the ant |
| Space or Climb / Get down | Enter a nearby climb surface, transfer, or find a safe landing |
| M or Explore | Enter or leave the free world camera |
| B or character switch | Toggle between bird and ant after the checklist is complete |
| P or Escape | Pause or resume |

Movement follows the view, with short acceleration/braking, normalized diagonals, and body turning independent of travel direction. The camera follows position without overriding the selected angle. Pause, Settings, About, view changes, focus loss, and pointer cancellation release movement; resume with a fresh input. Text fields, selects, and focused buttons keep native keyboard behavior.

## Touch

The left joystick moves 360 degrees relative to the camera's horizontal heading. A central deadzone blocks accidental input, and distance from the center controls speed, including on diagonals. Hold Run with another finger for ground running; use Climb / Get down and camera reset as needed. Drag uncovered scene space to orbit while moving. As with keyboard movement, the ant keeps its current ground heading while the camera moves.

Explore hides movement controls. One finger pans; two rotate and pinch-zoom. Returning restores gameplay touch controls.

## Bird flight

Complete every checklist objective to unlock the top character switch. It reads Fly as bird, then Play as ant while flying; mobile shows the shorter Bird/Ant labels. The ant keeps its position, including its current climb surface, while the bird is controlled.

WASD/arrows and the mobile joystick steer relative to the camera, with gradual curved turns and banking. Look up/down while moving forward to climb/descend. Desktop also supports holding Space to rise or Ctrl to descend. C resets the view behind the bird. M enters Explore and suspends movement while the wings keep flapping. Mobile hides A/B while flying and uses the joystick plus camera gestures. Bird collision and minimum terrain/water clearance remain active in debug mode; the bird follows rising terrain at its minimum clearance instead of stopping against an invisible height barrier.

## Explore and debug

In Explore, left drag orbits, right drag pans, and wheel zooms; gameplay movement pauses while a climbing ant remains mounted.

Debug is off by default. Add `?debug=1` (or `?q=mid&debug=1`) to enable diagnostics: G toggles climb overlays, Y toggles flight (movement keys, Space up, Ctrl down), and Shift+left-drag in Explore relocates a grounded ant to valid terrain. R cycles radio music; V tests voices. Debug tools are not in the touch panel. Remove the query and reload to disable them.

With `?debug=1`, B or the character switch also enables the playable bird immediately, without completing or changing objectives. Its debug overlay shows the bird position and collision sphere. The debug bypass is not stored in saves. Normal bird access is restored from the saved checklist; reload starts in Ant View.

Expand Time preview in the debug overlay, enter an exact time, and press Apply. Freeze time holds that preview for inspection; uncheck it to let the preview advance. Use game clock returns to the normal simulation time. The preview drives lighting, time-based objectives, and ambient/radio time selection, while the saved clock continues separately. G hides the overlay and clears the preview. The first bird selection displays Preparing bird while its model, animation bounds, and collision data are prepared once; subsequent switches reuse them.

Settings includes Language, chimes, optional live FPS diagnostics, About, and Graphics quality (Auto/Low/Mid/Full). Apply and reload saves progress and remembers the selection; Auto uses the device default. Pause manages resume, restart, and local save slots.

Apply and reload matches other primary dialog buttons. Touch/mouse suppress lingering focus outlines; keyboard restores them. Hover effects require a fine, hover-capable pointer. Native dropdowns keep normal behavior.

See [gameplay.md](gameplay.md) for surface contact behavior and [verification.md](verification.md) for manual checks.
