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

1. On a real touch device, move the joystick from deadzone to rim in cardinal and diagonal directions. Check gradual speed, diagonal movement, release outside the pad, and cancelled touches.
2. Hold A (lower-left action) to run; use B (above/right) to climb/get down. Check bottom clearance in portrait/landscape. Swipe with the other thumb while holding each joystick direction; camera orbit should not steer the ant's held ground path, matching keyboard movement. Retest after release/repress, reset/zoom, and returning from Explore. Repeat on climbable surfaces at all qualities, checking jitter.
3. Test portrait and short landscape, expanded checklist, Settings/About, pause/save slots, and English/Indonesian. Time stays top-left within the safe area, clear of top-right controls. Checklist chevron points up when open/down when closed. Language/quality selects share chevron shape and 160 ms rotation, and remain tappable. FPS diagnostic stays bottom-right without covering controls. Pause omits language, sound, quality, diagnostic, and About. Keep controls/prompts legible and reachable.
4. In Explore, test one-finger pan and two-finger rotate/zoom; return and check gameplay touch mapping.

## Progress and profiles

Collect/deliver both seed batches, reload a save, and check offering/discoveries. Compare `?q=full`, `?q=mid`, and `?q=low`; geometry and objectives should match. With FPS diagnostics on, Full warns below 30 FPS, Mid/Low below 14. Normal capped 18-20 FPS stays green; genuine low FPS turns panel/warning red, recovery does not flicker, and the warning suggests Low or closing apps. Assess capped profiles separately from Full.

For the bird, check that the switch is absent before checklist completion, appears afterward, and also appears with `?debug=1`. Verify B/switch returns to the ant without changing its position or climb surface. Fly toward tree trunks/branches, reader, lamp, tent, rocks, and burrow; collisions should stop or slide along them. Descend over land and water and confirm the bird stays above the configured clearance. Check curved turning, wing orientation, banking, and camera feel on a real device in Low/Mid/Full. Mobile must hide A/B while keeping joystick/camera input and the top Ant switch reachable. Test pause, Settings/About, Explore, focus loss, and switching while input is held. Reload a completed save without debug and confirm the reward remains unlocked and starts in Ant View. Headless motion/collision/model checks do not prove the visual or physical touch feel.

Verify initial startup does not request/decode the bird through the scene loader; service-worker caching may fetch it separately. The first Bird selection should show Preparing bird and later switches should reuse preparation. Compare real-device FPS in Ant View before and after a flight. In debug Time preview, apply noon, dusk, midnight, and dawn; check lighting, lamp, stars, reader routine, fireflies, and the HUD clock. Freeze/unfreeze, apply while paused, and return to the game clock; saved world time should remain independent of the preview.

Fly beside thin branch tips and over rising terrain at minimum clearance, including while holding descend; nearby empty space should remain navigable. Enter Explore with the bird visible: wings should keep flapping while its position stays fixed and the free camera remains under player control. Pause should freeze the wings, and returning to the ant should remove all bird frame work.

See [pwa.md](pwa.md) for installation, cache, saves, and offline checks. Syntax/headless passes do not prove visuals, gameplay, performance, or device behavior. The headless locator check covers visibility, world tracking, pulse, ant-unavailable recovery, and resource disposal.
