# Manual game verification

Use this manual checklist for browser/device behavior; validation scripts do not start a server or preview.

## Movement and view

1. Open `index.html?q=full`; test W/A/S/D separately. Travel should match screen directions without forced arcs, and the ant should turn smoothly.
2. Compare straight/diagonal speed, then release. Diagonals should match straight speed and stopping should not produce a long slide.
3. Walk right/back for several seconds: camera assist should turn toward travel after a delay, then stop when travel stops, without snapping or changing pitch/zoom. Orbit/zoom while walking; assist pauses during input and for 2.5 seconds after. Check the wide start and zoom-out range; C/reset returns behind the ant. Repeat at Low/Mid/Full. Joystick checks are below; it must not trigger automatic turning.
4. Run with Shift, then walk/stop near burrow, pond edge, trees, rocks, tent, and reader. Check blockers, narrow gaps, and ripples. Climb a tree, rock, reader, radio, lamp, and tent; test diagonal movement, release, safe dismount, and camera tracking.
5. Open Settings/About, pause, enter Explore, leave the tab, and return while moving. Check no stuck movement/running, About returns to Settings, Settings resumes only if it initiated pause, mounted ants stay mounted in Explore, and returning requires fresh input.
6. In Explore, verify the red beam/glowing sphere stays on the ant while grounded and climbing; view it from above and beside a tree. Return to Ant View and confirm immediate hiding. Repeat all qualities.

## Touch and layout

1. On a real touch device, move the joystick from deadzone to rim in several directions. Check gradual speed, diagonals, release outside the pad, and cancelled touches.
2. Hold A (lower-left action) to run; use B (above/right) to climb/get down. Check bottom clearance in portrait/landscape. Rotate camera 90 and 180 degrees while moving/stopped: joystick up/down must move away from/toward the current view, left/right across it. Retest after release/repress, reset/zoom, and returning from Explore. Camera follows position without turning behind joystick travel. Repeat on climbable surfaces at all qualities, checking jitter.
3. Test portrait and short landscape, expanded checklist, Settings/About, pause/save slots, and English/Indonesian. Time stays top-left within the safe area, clear of top-right controls. Checklist chevron points up when open/down when closed. Language/quality selects share chevron shape and 160 ms rotation, and remain tappable. FPS diagnostic stays bottom-right without covering controls. Pause omits language, sound, quality, diagnostic, and About. Keep controls/prompts legible and reachable.
4. In Explore, test one-finger pan and two-finger rotate/zoom; return and check gameplay touch mapping.

## Progress and profiles

Collect/deliver both seed batches, reload a save, and check offering/discoveries. Compare `?q=full`, `?q=mid`, and `?q=low`; geometry and objectives should match. With FPS diagnostics on, Full warns below 30 FPS, Mid/Low below 14. Normal capped 18-20 FPS stays green; genuine low FPS turns panel/warning red, recovery does not flicker, and the warning suggests Low or closing apps. Assess capped profiles separately from Full.

See [pwa.md](pwa.md) for installation, cache, saves, and offline checks. Syntax/headless passes do not prove visuals, gameplay, performance, or device behavior. The headless locator check covers visibility, world tracking, pulse, ant-unavailable recovery, and resource disposal.
