# Manual game verification

Use this manual checklist for browser/device behavior; validation scripts do not start a server or preview.

## Debug UI refactor

`npm test` includes headless debug UI checks with DOM, timer, and session stubs. They cover debug-off isolation, one 100 ms readout timer, ant/bird labels and camera degrees, localized checklist controls including seed completion, time apply/freeze/reset, G/Y/R/V/T dispatch, Shift-click/drag pointer handling, and disposal. Existing controller tests cover time preview/save separation, objective completion, offering availability, and bird behavior. These checks do not prove browser event propagation, rendered layout, audio, or device input.

1. Open `index.html?debug=1`, check live ant/camera values, then toggle G off/on. Repeat in Explore and Bird View; the readout and label should follow the active character. Change language and confirm labels and checklist shortcut descriptions update.
2. Apply, freeze/unfreeze, and reset Time preview, including while paused. Toggle G off and confirm the game clock resumes. Complete a checklist task and select the Seeds checklist circle from both empty-handed and carrying states; check the offering appears, shortcuts disable when complete, and progress survives reload.
3. Toggle Y debug flight and return to ground. Exercise R/V radio controls and T weather; T should still work when G hides the overlay. Use B/the character switch to access the bird before checklist completion without changing progress.
4. In Explore, Shift-click valid terrain, then Shift-drag. Check the ant relocates while the camera stays still; normal orbit/pan/zoom should work afterward. Release Shift, cancel the pointer, and switch views during a drag to check input recovery. Relocation must be unavailable while controlling the bird.
5. Reload without `debug=1`. Confirm no debug overlay, hints, checklist completion buttons, or debug actions appear; check normal movement, climbing, dialogs, saves, radio/weather, and the earned bird unlock. Repeat in the generated release and offline after the version 1.0.2 worker activates.

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

For the bird, check that the switch is absent before checklist completion, appears afterward, and also appears with `?debug=1`. Verify B/switch returns to the ant without changing its position or climb surface. Fly toward tree trunks/branches, reader, lamp, tent, rocks, and burrow; collisions should stop or slide along them. Descend over land and water and confirm the bird stays above the configured clearance. Check curved turning, wing orientation, banking, and camera feel on a real device in Low/Mid/Full. Mobile must hide the climb button while keeping joystick/camera input and the top Ant switch reachable. Test pause, Settings/About, Explore, focus loss, and switching while input is held. Reload a completed save without debug and confirm the reward remains unlocked and starts in Ant View. Headless motion/collision/model checks do not prove the visual or physical touch feel.

Verify initial startup does not request/decode the bird through the scene loader; service-worker caching may fetch it separately. The first Bird selection should show Preparing bird and later switches should reuse preparation. Compare real-device FPS in Ant View before and after a flight. In debug Time preview, apply noon, dusk, midnight, and dawn; check lighting, lamp, stars, reader routine, fireflies, and the HUD clock. Freeze/unfreeze, apply while paused, and return to the game clock; saved world time should remain independent of the preview.

Fly beside thin branch tips and over rising terrain at minimum clearance, including while holding descend; nearby empty space should remain navigable. Enter Explore with the bird visible: wings should keep flapping while its position stays fixed and the free camera remains under player control. Pause should freeze the wings, and returning to the ant should remove all bird frame work.

See [pwa.md](pwa.md) for installation, cache, saves, and offline checks. Syntax/headless passes do not prove visuals, gameplay, performance, or device behavior. The headless locator check covers visibility, world tracking, pulse, ant-unavailable recovery, and resource disposal.

## Tree and rock movement regressions

Headless `npm test` covers exact footprint clearance through a body-width gap, sloping geometry above the ant, solid trunk interiors, swept paths, diagonal sliding, and rejected blocked climb-entry fallbacks. These checks do not prove visual fit or touch feel.

Use your local server and test `?q=full&debug=1`, then repeat with `q=mid` and `q=low`:

1. In Explore, use Shift+click/drag to put the grounded ant near a tree or rock. Return to Ant View. Walk and run around trunks, roots, woodland rocks, and shoreline rocks from both directions. Hold diagonal input against an angled edge and check that the ant slides when space is available.
2. Walk through gaps visibly wider than the ant body between two rocks and between a root and a rock. Repeat in reverse and with the mobile joystick at partial/full travel. Tight gaps should stop the body; wider gaps should allow passage without a large invisible margin. Legs may brush edges.
3. Climb each tree, move around several sides and heights, then use Space or the touch climb action to get down. Immediately move in every direction. Repeat beside roots, rocks, and the trunk. The landing must be outside solid wood and allow movement; when no landing is available the ant must remain mounted.
4. Climb onto rocks and travel across tops and edges. Check contact stability and the climb/get-down action. Also retest the reader, radio/support rock, lamp, and tent, including getting down near neighboring obstacles.
5. Repeat after save/reload, returning from Explore, and entering/exiting the burrow. Check the same paths on a real touch device. After rebuilding a release, repeat with its updated service worker active and once offline.

### Trunk circuits and branch junctions

`check-climbing-surfaces.mjs` exercises complete trunk circuits in both directions, exposed bark with a distant limb along its normal, head-on branch-to-trunk movement, and rejection of a branch surface embedded in the trunk. These use the runtime surface-query methods against merged wood meshes without a browser. Additional checks cover an internal limb hiding an enclosing trunk, a clear contact whose lifted ant pose intersects nearby wood, and preservation of exact bark contacts plus sideways steps in both directions at 48 sampled positions on the generated default Full tree. The generated-tree samples do not prove uninterrupted real-device circuits.

On each tree quality, climb onto the trunk and hold left/right to complete a circle at several heights, including the location shown in the reported screenshot. Repeat clockwise and counterclockwise. Walk along the top of a branch directly toward the trunk, without first moving to the branch side; forward movement should transfer onto the trunk and continue upward. Repeat at several branch junctions with keyboard and joystick. Confirm the ant stays on visible bark, including when circling past a junction, then get down and verify free ground movement.

The generated-bark tests supply canvas stubs so the real numeric bark displacement runs instead of the no-document flat-bark fallback. They check a closed main-trunk seam and caps, and continuous circuits in both directions on the isolated displaced main trunk. Whole-tree samples still include branch overlaps. If a specific spot remains blocked, record the Ant position x/y/z from the G debug panel and the blocked movement direction so the exact world-space contact can be reproduced.

The reported vertical strip near x 0.441, z -0.324 has a regression test that walks the displaced Full tree in both directions near local heights 4, 4.156, and 5. Before the buried attachment ends were capped, the height-4.156 path stopped after seven steps. In the browser, retry the reported world position x 0.441, y 4.156, z -0.324 and nearby heights after reloading the rebuilt tree; its world Y also includes terrain placement. Check circling, branch transfers, and getting down, including that the ant never enters the trunk.

After reloading, confirm the standalone non-climbable pond stone near x 11.432, y 0.190, z -2.296 is gone and that the ant can walk across its former footprint without an invisible blocker. Check that the neighboring shoreline rocks still render and can be climbed, and that stepping into the pond still produces water ripples.

For clustered rocks near the radio, climb onto one rock and walk across touching tops in both directions, including raised joins and the radio support rock. Walk around the sides and get down beside the cluster. Confirm the ant stays outside solid rock, can wrap around exposed edges, and does not jump across a separate empty gap. Repeat with the mobile joystick and Low/Mid/Full. `check-rock-traversal.mjs` covers shared rock surfaces, radio support groups, rejection of buried contacts, separate gaps, and direct per-instance queries.
