# Manual game verification

The project instructions leave browser and device testing to the user unless explicitly requested. No static server or browser preview is launched by the validation scripts.

## Movement and view

1. Open the game at `index.html?q=full`. Hold W, then A, S, and D separately. Movement should match screen directions without forcing an arc; the ant should turn smoothly to face travel.
2. Compare straight and diagonal speed. Release the keys and check the short stop feels controlled, without a long slide.
3. Using keyboard controls, travel right and backward for several seconds: the camera should gently turn toward travel after a short delay without snapping or changing zoom or pitch. Stop and confirm turning stops. Orbit or zoom while walking: assistance should pause during input and for 2.5 seconds afterward. Check the wider starting view and zoom-out range. Press C or use the reset button to return behind the ant. Repeat at low, mid, and full quality. For joystick controls, use the touch checks below; automatic turning is disabled.
4. Hold Shift to run, then walk and stop near the burrow, pond edge, trees, rocks, tent, and reader. Check blockers, narrow gaps, and water ripples.
5. Climb a tree, rock, reader, radio, lamp, and tent. Check diagonal surface movement, releasing input, safe dismounts, and camera tracking.
6. Open Settings and About, pause, switch to Explore, leave the browser tab, and return while movement was held. There should be no stuck movement or running. Closing About should return to Settings. Closing Settings should resume play when Settings initiated the pause. Explore should preserve a mounted ant and returning should require fresh movement input.
7. Switch to Explore and confirm the red locator beam and glowing sphere stay centered on the ant, including while the ant is on a climbable prop. View the sphere from above and from the side while the ant is on a tree. Return to Ant View and confirm the locator disappears immediately. Repeat at low, mid, and full quality.

## Touch and layout

1. On a real touch device, slowly move the joystick from its deadzone to the rim in several directions. Check gradual speed, diagonals, releasing outside the pad, and cancelled touches.
2. Hold A at the lower left of the action pair to run; use B above and to the right for climb/get-down. Confirm comfortable bottom clearance in portrait and landscape. Rotate the camera by 90 and 180 degrees, both while moving and while stopped. Joystick up must always move away from the current camera, down toward it, and left/right across the view. Release and press again, reset/zoom the camera, and return from Explore: the same mapping should hold. The camera must follow position without automatically turning behind joystick travel. Repeat on walkable climbing surfaces and at low, mid, and full quality, checking for jitter.
3. Test portrait and short landscape windows, expanded checklist, Settings, About, pause/save slots, and both English and Indonesian. The time should remain at the safe-area top-left without overlapping the top-right controls. The checklist chevron should point up while expanded and down while collapsed. The Language and Graphics quality selects should use the same chevron shape and 160 ms rotation when pressed or opened, and remain easy to tap. Enable Performance diagnostic and confirm it stays at the bottom-right without covering touch controls. Pause should not contain language, sound, quality, diagnostic, or About controls. Controls and prompts should remain legible and reachable.
4. In Explore, verify one-finger pan and two-finger rotate/zoom. Return to play and check the normal touch mapping.

## Progress and profiles

Collect and deliver both seed batches, reload a save, and check the offering phase and discoveries. Compare `q=full`, `q=mid`, and `q=low`; verify scene geometry and objectives are consistent. With Performance diagnostic enabled, Full should warn below 30 FPS while Mid/Low should warn below 14 FPS. Confirm normal 18 to 20 FPS capped rendering stays green, the panel and warning switch to red when performance is genuinely low, and recovery does not flicker. The warning should suggest Low quality or closing other apps. Mid/low still target about 20 FPS, so assess those profiles separately from full.

Follow [pwa.md](pwa.md) for installation, cache updates, save persistence, and offline checks. Passing syntax and headless tests is not visual, gameplay, performance, or device proof. The headless locator check covers visibility state, world-position tracking, pulse changes, recovery when the ant is unavailable, and render-resource disposal.
