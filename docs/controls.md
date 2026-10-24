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
| P or Escape | Pause or resume |
| F | Fullscreen |

Movement follows the view, with short acceleration/braking, normalized diagonals, and body turning independent of travel direction. The camera follows position without overriding the selected angle. Pause, Settings, About, view changes, focus loss, and pointer cancellation release movement; resume with a fresh input. Text fields, selects, and focused buttons keep native keyboard behavior.

## Touch

The left joystick moves 360 degrees: a central deadzone blocks accidental input, and distance controls speed. Hold Run with another finger for ground running; use Climb / Get down and camera reset as needed. Drag uncovered scene space to look while moving.

Explore hides movement controls. One finger pans; two rotate and pinch-zoom. Returning restores gameplay touch controls.

## Explore and debug

In Explore, left drag orbits, right drag pans, and wheel zooms; gameplay movement pauses while a climbing ant remains mounted.

Debug is off by default. Add `?debug=1` (or `?q=mid&debug=1`) to enable diagnostics: G toggles climb overlays, Y toggles flight (movement keys, Space up, Ctrl down), and Shift+left-drag in Explore relocates a grounded ant to valid terrain. R cycles radio music; V tests voices. Debug tools are not in the touch panel. Remove the query and reload to disable them.

Settings includes Language, chimes, optional live FPS diagnostics, About, and Graphics quality (Auto/Low/Mid/Full). Apply and reload saves progress and remembers the selection; Auto uses the device default. Pause manages resume, restart, and local save slots.

Apply and reload matches other primary dialog buttons. Touch/mouse suppress lingering focus outlines; keyboard restores them. Hover effects require a fine, hover-capable pointer. Native dropdowns keep normal behavior.

See [gameplay.md](gameplay.md) for surface contact behavior and [verification.md](verification.md) for manual checks.
