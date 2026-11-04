# Game controls

Near the surface burrow, press U or tap Enter burrow to visit the underground floor. At the daylight entrance, press U or tap Return outside. E and the Zzz button open sleep choices anywhere while playing as the ant. Underground uses the usual movement, running, orbit, zoom, C reset, and M Explore inputs; climbing and bird switching are unavailable there. Underground Explore is labeled Map. M or Map opens a top-down floor plan and pauses movement. Pinch or scroll to zoom the map and drag to pan. Show labels uses the Settings checkbox style and starts checked; uncheck it to hide map text while keeping markers visible. the X close button, M, or Escape closes it. The walking camera stays inside the tunnels and keeps the ant visible. Return outside appears near the entrance on both desktop and mobile; U is an additional desktop shortcut. See [underground.md](underground.md).

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
| E or Zz | Rest until morning or night |
| P or Escape | Pause or resume |

Movement follows the view, with short acceleration/braking, normalized diagonals, and body turning independent of travel direction. The camera follows position without overriding the selected angle. Pause, Settings, About, view changes, focus loss, and pointer cancellation release movement; resume with a fresh input. Text fields, selects, and focused buttons keep native keyboard behavior.

Anywhere while playing as the ant, choose morning (07:00) or night (19:00). The screen fades as the clock advances and the result is saved. The close button or Escape returns without sleeping. The Zz button is available on touch devices.

## Touch

The left joystick moves 360 degrees relative to the camera's horizontal heading. A central deadzone blocks accidental input, and distance from the center controls speed, including on diagonals. Push toward the outer edge to run on the ground and ease back to walk; climbing stays at walking speed. Use Climb / Get down and camera reset as needed. Drag uncovered scene space to orbit while moving. As with keyboard movement, the ant keeps its current ground heading while the camera moves.

Explore hides movement controls. One finger pans; two rotate and pinch-zoom. Returning restores gameplay touch controls.

## Bird flight

Complete every checklist objective to unlock the top character switch. It reads Fly as bird, then Play as ant while flying; mobile shows the shorter Bird/Ant labels. The ant keeps its position, including its current climb surface, while the bird is controlled.

WASD/arrows and the mobile joystick steer relative to the camera, with gradual curved turns and banking. Look up/down while moving forward to climb/descend. Desktop also supports holding Space to rise or Ctrl to descend. C resets the view behind the bird. M enters Explore and suspends movement while the wings keep flapping. Mobile hides the climb button while flying and uses the joystick plus camera gestures. Bird collision and minimum terrain/water clearance remain active in debug mode; the bird follows rising terrain at its minimum clearance instead of stopping against an invisible height barrier.

## Explore and debug

In Explore, left drag orbits, right drag pans, and wheel zooms; gameplay movement pauses while a climbing ant remains mounted.

Debug is off by default. Add `?debug=1` (or `?q=mid&debug=1`) to enable diagnostics: G toggles climb overlays, Y toggles flight (movement keys, Space up, Ctrl down), and Shift+left-drag in Explore relocates a grounded ant to valid terrain. R cycles radio music; V tests voices. Debug tools are not in the touch panel. Remove the query and reload to disable them.

While the debug overlay is active, select an incomplete checklist circle to complete that task. Select the Seeds circle to complete seed collection and make the offering leaf available at the burrow, including while carrying a seed. Completing the offering also completes the seeds. These shortcuts change and autosave the active slot and are disabled for completed tasks. Tapping an open discovery card tilts it toward the touched side and makes it spring back, unless reduced motion is enabled.

With `?debug=1`, B or the character switch also enables the playable bird immediately, without completing or changing objectives. Its debug overlay shows the bird position and collision sphere. The debug bypass is not stored in saves. Normal bird access is restored from the saved checklist; reload starts in Ant View.

Expand Time preview in the debug overlay, enter an exact time, and press Apply. Freeze time holds that preview for inspection; uncheck it to let the preview advance. Use game clock returns to the normal simulation time. The preview drives lighting, time-based objectives, and ambient/radio time selection, while the saved clock continues separately. G hides the overlay and clears the preview. The first bird selection displays Preparing bird while its model, animation bounds, and collision data are prepared once; subsequent switches reuse them.

Settings includes Language, chimes, radio volume, optional live FPS diagnostics, About, and Graphics quality (Auto/Low/Mid/Full). Climb onto the radio to reveal a volume button and adjust its circular dial by touch, mouse, or keyboard. The dial and Settings slider immediately change music and radio voices and are saved automatically; ambient sounds and radio static are separate. Apply and reload applies graphics quality; Auto uses the device default. Pause manages resume, restart, and local save slots.

About includes a share button for the game's public link. It opens the device share sheet when available, or copies the link; the link can also be selected and copied manually.

Apply and reload matches other primary dialog buttons. Touch/mouse suppress lingering focus outlines; keyboard restores them. Hover effects require a fine, hover-capable pointer. Native dropdowns keep normal behavior.

See [gameplay.md](gameplay.md) for surface contact behavior and [verification.md](verification.md) for manual checks.

Open Cards beside Checklist to view the discovery collection. Select an unlocked card to read it; use the chevrons to cycle through discovered cards, Back to return to the grid, and Escape or the close button to return to play. New discoveries briefly show a notice that opens the card. On touch devices, interface text does not select on a long press; editable fields remain selectable.


## Carrying and building

Contextual carry/build actions and the burrow exit share one wrapping dock. Guidance appears briefly near the task cards when state changes instead of remaining above the buttons. Touch uses compact notifications and 44 px minimum button heights. In short landscape viewports, the shared dock sits below the central player view and above the touch hint.

Seeds now require Pick up seed rather than collision pickup. Desktop F activates the primary contextual action; touch and mouse use the visible action button. Pick up, Drop here, Deposit leaf, and Material store appear only when relevant. Dropping requires dry ground or the burrow floor and is disabled while climbing/flying, on water/steep slopes, or near blocked footprints and entrances. Leaves and sticks scatter on dry surface ground from the start. Empty-handed at the underground store, open storage and select a material slot to carry one item, or select a build card to start placement. Store and Build each show six compact slots, with Coming soon in unused slots. A bed costs two stored leaves and a twig frame costs three stored sticks. Build as many copies as your materials and available floor space allow. Move to adjust the preview, select Place here to confirm, or Cancel/Escape to stop. Rest on the finished bed opens the existing sleep choices. See [burrow-building.md](burrow-building.md).

Refreshing or continuing a save made underground restores the ant to its saved underground position and facing. Older saves without an underground checkpoint resume on the surface.
