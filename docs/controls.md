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

Movement direction is independent of the ant's visible turning animation. The camera follows position while keeping the angle selected by the player. Starts and stops have short acceleration and braking; changing direction does not force a wide turn. Diagonals are limited to the same maximum speed as straight movement.

Pause, Settings, About, switching view, focus loss, and pointer cancellation clear held movement. Resume with a fresh press or touch. Text fields, selects, and focused buttons retain their native keyboard interaction.

## Touch

Use the left joystick for 360-degree movement. Its central deadzone prevents tiny accidental motion. Moving farther from the center increases speed. Hold Run with another finger for ground running, use Climb / Get down for traversal, and use the camera reset button to restore the view. Drag the uncovered scene to look around while moving.

In Explore, the movement controls are hidden. One finger pans; two fingers rotate and pinch to zoom. Returning to play restores the gameplay touch mapping.

## Explore and debug

In Explore, left drag orbits, right drag pans, and the wheel zooms. Gameplay movement is suspended. An ant on a climb surface remains mounted while Explore is active.

Debug is disabled by default. Open `index.html?debug=1` to enable it (or `?q=mid&debug=1` to also select quality). G toggles climb diagnostics and Y toggles debug flight. Flight uses movement keys, Space to rise, and Ctrl to descend. With debug enabled, Shift plus left drag in Explore relocates a grounded ant to validated terrain. R cycles radio music and V tests voices. These tools remain outside the ordinary touch control panel. Remove the debug query and reload to disable them.

Settings includes Language, soft feedback chimes, an optional realtime FPS diagnostic, About, and Graphics quality: Auto, Low, Mid, and Full. Apply and reload saves progress and remembers the selection before reloading the world. Auto uses the device default. Pause contains resume/restart actions and local save-slot management.

Apply and reload uses the same full-size primary button styling as the other dialog actions. Touch and mouse input suppress lingering focus outlines; keyboard input restores visible focus indicators. Hover highlights apply only to devices with a fine pointer and hover support. Native dropdowns retain their normal selection behavior.

See [gameplay.md](gameplay.md) for surface contact behavior and [verification.md](verification.md) for manual checks.
