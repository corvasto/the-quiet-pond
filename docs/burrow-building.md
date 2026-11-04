# Carrying and burrow building

Gathering is available from the start. Eighteen procedural leaves are scattered across dry surface ground. Recipes include a two-leaf resting bed and a three-stick decorative frame. Existing objective progress, the offering, sleep access, and bird reward remain available.

## Interaction

Move within reach of a seed or leaf, then select Pick up. Desktop F uses the primary contextual action; touch and mouse use the same visible button. Seed collision no longer collects automatically. Existing seed delivery to the surface burrow still occurs when carried into its delivery radius. The pond offering retains its existing dedicated interaction, and waits if a building leaf occupies the carrying slot.

Only one object can be carried. Building leaves remain visibly attached while walking or climbing and transfer to the active ant when entering or exiting underground. Carried seeds can travel underground and back, while their objective destination remains the surface burrow. A seed in the carrying slot continues to use the existing reload behavior, returning to its safe game spawn instead of restoring as carried.

Drop here places an object just ahead of the ant, aligned to the ground height and slope. Dropping is allowed only on dry surface ground or the burrow floor. Climbing, flying, water and its edge, steep slopes, solid scenery, other placed objects, and the entrance reserve reject the action. Both the object's footprint and the path from the ant to its landing point are checked. Loose materials and the soft leaf bed do not block walking.

## Store and bed

The underground store occupies the storage chamber and appears on the map from the start. A round soil deposit tray marks it even when empty. Carry a leaf there and select Deposit leaf. Drop here remains a separate action nearby. With empty hands, open Material store to see material slots with large leaf/stick drawings and numeric counts. Select a slot to withdraw one item.

After storing two leaves, choose Build leaf bed from storage in the material store. A green/red preview follows the ant. Move to choose the spot, select Place bed to confirm, or Cancel/Escape to stop. Placement checks the real footprint plus an ant-width walking margin, away from walls, roots, storage, other objects, and the exit. The reach check follows the ant-width path to the destination rather than sweeping the full build from the ant. No materials are spent during preview or cancellation. Successful confirmation consumes exactly two stored leaves and creates one permanent bed. Each recipe can be built repeatedly while its full cost is in storage. Its nearby Rest action opens the existing sleep choices. The bed also appears on the underground map.

The material store has an X close action, tappable material slots, and native modal focus containment. Carry/build controls appear only when relevant and use text without keyboard letters on touch screens. Desktop shows the F hint on the primary action. Exit and building controls share a wrapping dock so they cannot occupy the same screen position. Guidance appears as a three-second notification near the task cards, with a cooldown to avoid repeated hints. The UI refreshes at a bounded cadence and only rebuilds controls when their state changes.

## Saves and ownership

The existing three JSON/localStorage save slots gain an optional `colony` object, version 2. Old saves without it get an empty store and no bed. Each stable material ID has one state: loose, carried, stored, or used. Loose leaves store their surface/burrow area, X/Z, and rotation. Storage counts derive from the item records; they are not independently persisted. Bed position and heading are saved. Carrying a building leaf survives reload and safely resumes with the ant outside. Dropped seeds retain their loose positions through records tied to the restored active seed list; carried-seed restoration stays unchanged.

Every pickup, drop, deposit, withdrawal, and completed build requests the existing autosave and the UI saves immediately. Stored/used objects cannot be picked up as loose objects, occupied hands prevent a second pickup, and build confirmation rechecks the floor and stock before spending. Invalid saved floor locations recover to source positions or storage; invalid saved beds refund used leaves. Saves serialize gameplay data only, never Three.js objects.

| File | Responsibility |
| --- | --- |
| `js/config/building.js` | Counts, reach, slope, recipe cost, and placement clearance |
| `js/game/material-state.js` | Stable leaf ownership, resource transfers, save validation, and construction cost |
| `js/generators/building-materials.js` | Shared procedural curved leaves, veins, bed, preview, and resource disposal |
| `js/game/burrow-building.js` | World integration, floor checks, contextual actions, storage, preview, carry attachments, and loose seed restoration |
| `js/game/game-session.js` | Public actions, save composition, shared carrying guards, and mode transitions |
| `js/main.js` | Keyboard/touch/mouse buttons, storage dialog, translation, and save UI |

No new model or texture download is required. Source geometry is generated when the material controller initializes. Floor checks use existing numeric proxies and fixed-size footprint samples; no per-frame model traversals or unbounded raycasts are introduced. Core does not import the building controller. Runtime modules are registered in the service-worker shell.

## Verification

Run npm run check, npm test, npm run build:release, npm run check:release, and git diff --check. The building checks cover unique ownership, JSON round trips, old/corrupt saves, manual seed pickup, climbing/water/slope/entrance rejection, cross-world carrying, contoured drops, storage, preview cancellation, atomic build cost, offering occupancy, and cleanup.

The user must verify browser/device behavior. Check desktop and mobile pickup/drop buttons; climbing with an object and ground-only drop feedback; dry-ground, water-edge, and root clearance; material entry/exit transfer; storage/X/focus; bed preview and cancellation; exact two-leaf spending; Rest; map markers; and reloads with dropped leaves, stored leaves, a carried leaf, and a completed bed. Confirm the original seed delivery, offering, sleep, climbing, and bird reward still work. Review source and generated release offline after caching. No static server or preview is started by the checks.


Carried leaves pivot at their stem, outside the shared ant model hierarchy. A cached reference to the authored head joint supplies a mandible-center grip position while walking and climbing. Attachment tuning lives in BUILDING_CONFIG.leafCarry; the head offset uses native model units, while the fallback uses world units. This adds no per-frame graph traversal. Dropping clears the stem offset and restores the centered floor-placement pivot. Branch veins follow the leaf surface and stay within its outline.

Material definitions and recipes live in `js/content/building.js`. Typed item records, per-material stock, recipe costs, build limits, and consumed item IDs are generic. Add a procedural factory for a new visual. Version 1 saves migrate to version 2 build records.

The store separates Store and Build into green and warm brown inset panels, side by side on wider screens and stacked on narrow screens. Both use equal compact cards in a three-column, two-row grid, proportional illustrations, beveled gradients, and visible focus rings. Select a material slot to carry one item. Build cards show an illustration of the completed recipe and its material cost. Select the card to start placement; unavailable illustrations are muted only when the full recipe cost is missing. Each section has six compact slots; unused slots show Coming soon. Recipe cards remain inside the store; chamber floors do not show disabled build shortcuts. Build buttons remain disabled until the full cost is stored. The soft bed supports walking with a smooth height profile instead of acting as a solid obstacle. Surface grass clears beneath loose leaves and returns after pickup. Twelve small procedural sticks scatter on dry surface ground from the start. Gather and deposit three sticks to build a decorative twig frame. Sticks have a separate inventory count, pickup label, carry visual, recipe cost, and saved item IDs. Previously built leaf shelters remain readable in saves. Both builds persist in saves.

Sleep sits beside the clock. Radio captions use measured HUD and action-dock exclusion rectangles with resize and content observers. Underground camera orbit constrains angles near walls before compressing zoom, with gradual outward recovery.

Underground saves include active area, floor X/Z, and facing direction. Startup loads the interior only for an active underground checkpoint, restores height from the current floor and bed support, and retains the parked surface ant for returning outside. Invalid positions fall back to the underground entrance; older saves continue on the surface. Every bed is included on the map.

Page hide and unload save the active checkpoint before UI cleanup. The cache version advances with this fix so existing offline installations receive the checkpoint code. Map labels can be toggled without resetting the current pan or zoom.
