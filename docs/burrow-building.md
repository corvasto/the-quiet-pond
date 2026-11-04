# Carrying and burrow building

The first recipe is a resting bed made from two procedural leaves. Finishing the seed objective unlocks six fallen building leaves near the surface burrow. Existing objective progress, the offering, sleep access, and bird reward remain available.

## Interaction

Move within reach of a seed or leaf, then select Pick up. Desktop F uses the primary contextual action; touch and mouse use the same visible button. Seed collision no longer collects automatically. Existing seed delivery to the surface burrow still occurs when carried into its delivery radius. The pond offering retains its existing dedicated interaction, and waits if a building leaf occupies the carrying slot.

Only one object can be carried. Building leaves remain visibly attached while walking or climbing and transfer to the active ant when entering or exiting underground. Carried seeds can travel underground and back, while their objective destination remains the surface burrow. A seed in the carrying slot continues to use the existing reload behavior, returning to its safe game spawn instead of restoring as carried.

Drop here places an object just ahead of the ant, aligned to the ground height and slope. Dropping is allowed only on dry surface ground or the burrow floor. Climbing, flying, water and its edge, steep slopes, solid scenery, other placed objects, and the entrance reserve reject the action. Both the object's footprint and the path from the ant to its landing point are checked. Loose materials and the soft leaf bed do not block walking.

## Store and bed

The underground store occupies the storage chamber and appears on the map after materials unlock. A small leaf pad marks it when empty. Carry a leaf there and select Deposit leaf. Drop here remains a separate action nearby. With empty hands, open Material store to see the leaf count or withdraw one leaf.

After storing two leaves, choose Build leaf bed from storage or on a chamber floor. A green/red preview follows the ant. Move to choose the spot, select Place bed to confirm, or Cancel/Escape to stop. A generous floor-clearance reserve keeps beds out of narrow tunnels, away from roots, storage, other objects, and the exit. No materials are spent during preview or cancellation. Successful confirmation consumes exactly two stored leaves and creates one permanent bed. The first version permits one bed. Its nearby Rest action opens the existing sleep choices. The bed also appears on the underground map.

The material store has an X close action and native modal focus containment. Carry/build controls appear only when relevant and use text without keyboard letters on touch screens. Desktop shows the F hint on the primary action. The UI refreshes at a bounded cadence and only rebuilds controls when their state changes.

## Saves and ownership

The existing three JSON/localStorage save slots gain an optional `colony` object, version 1. Old saves without it get an empty store and no bed. Each of the six leaf IDs has one state: loose, carried, stored, or used. Loose leaves store their surface/burrow area, X/Z, and rotation. Storage counts derive from the item records; they are not independently persisted. Bed position and heading are saved. Carrying a building leaf survives reload and safely resumes with the ant outside. Dropped seeds retain their loose positions through records tied to the restored active seed list; carried-seed restoration stays unchanged.

Every pickup, drop, deposit, withdrawal, and completed build requests the existing autosave and the UI saves immediately. Stored/used objects cannot be picked up as loose objects, occupied hands prevent a second pickup, and build confirmation rechecks the floor and stock before spending. Invalid saved floor locations recover to source positions or storage; invalid saved beds refund used leaves. Saves serialize gameplay data only, never Three.js objects.

| File | Responsibility |
| --- | --- |
| `js/config/building.js` | Counts, reach, slope, recipe cost, and placement clearance |
| `js/game/material-state.js` | Stable leaf ownership, resource transfers, save validation, and construction cost |
| `js/generators/building-materials.js` | Shared procedural curved leaves, veins, bed, preview, and resource disposal |
| `js/game/burrow-building.js` | World integration, floor checks, contextual actions, storage, preview, carry attachments, and loose seed restoration |
| `js/game/game-session.js` | Public actions, save composition, shared carrying guards, and mode transitions |
| `js/main.js` | Keyboard/touch/mouse buttons, storage dialog, translation, and save UI |

No new model or texture download is required. Source geometry is generated after unlocking. Floor checks use existing numeric proxies and fixed-size footprint samples; no per-frame model traversals or unbounded raycasts are introduced. Core does not import the building controller. Runtime modules are registered in the service-worker shell.

## Verification

Run npm run check, npm test, npm run build:release, npm run check:release, and git diff --check. The building checks cover unique ownership, JSON round trips, old/corrupt saves, manual seed pickup, climbing/water/slope/entrance rejection, cross-world carrying, contoured drops, storage, preview cancellation, atomic build cost, offering occupancy, and cleanup.

The user must verify browser/device behavior. Check desktop and mobile pickup/drop buttons; climbing with an object and ground-only drop feedback; dry-ground, water-edge, and root clearance; material entry/exit transfer; storage/X/focus; bed preview and cancellation; exact two-leaf spending; Rest; map markers; and reloads with dropped leaves, stored leaves, a carried leaf, and a completed bed. Confirm the original seed delivery, offering, sleep, climbing, and bird reward still work. Review source and generated release offline after caching. No static server or preview is started by the checks.
