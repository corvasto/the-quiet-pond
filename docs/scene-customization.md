# Scene customization

## Deterministic scene edits

`DEFAULTS.seed` drives procedural generation. Preserve the seed and seeded-random request order to keep existing camera sequences composed the same; adding/removing scattered items can shift later results. Change one thing at a time and verify the starter timeline.

## Imported asset definitions

Authored imported-model data lives in `ASSET_CATALOG` in `js/content/assets.js`. It compiles once into the existing `SCENE_PROPS` runtime shape:

```js
radio: defineAsset({
  file: 'old_radio.glb',
  label: 'Old radio on woodland rock',
  size: { width: 0.8 },
  orientation: { yawOffsetDegrees: 45 },
  placement: {
    strategy: 'pond-rock',
    lift: 0.012,
    offset: { x: 5.9, y: 0.1, z: -8.7 },
  },
  requiredModes: ['game'],
})
```

| Field | Purpose |
| --- | --- |
| `size.width` | Final horizontal width in scene units |
| `placement.strategy` | Selects the adapter that places the asset |
| `placement.offset.x/z` | Horizontal movement in ground/anchor space |
| `placement.offset.y` | Intentional vertical placement |
| `placement.lift` | Persistent support-surface contact correction |
| `orientation.yawDegrees` | Authored heading |
| `orientation.yawOffsetDegrees` | Correct model forward axis |
| `orientation.rotationDegrees` | X/Y/Z import correction |
| `modes` | Runtime modes that load the asset |
| `requiredModes` | Modes where a missing or invalid GLB stops startup |

`position`, `anchor`, or `relativeTo` selects a location; specialized adapters interpret anchors. `offset` adds authored X/Y/Z; `pondAngle`/`pondInset` select a point on the generated pond profile. `clearingRadius` reserves ground/vegetation where supported; finite `count` creates deterministic scatter. `clip` selects an animation by index/name; `frames` selects an automatic `fixed-ground` range. `clips`/`speeds` name actor states, `ranges` reuses frame ranges, and `framesPerSecond` sets timing. `requires` names a Boolean feature gate declared by every profile. `runtime` holds role-specific values compiled into the flat runtime view. `modes` defaults to `game`; `requiredModes` is a subset and defaults empty. Optional load failures are reported and skipped; required failures stop startup. The radio example is required in game mode. The validator enforces these rules. Definitions compile once into `SCENE_PROPS`, avoiding per-frame lookups.

Edit one value, reload, and compare the same camera frame. Use `lift` for surface contact and `offset.y` for intentional height.

## Ant tuning

The ant definition sets visual width/placement, walk range and animation speed, movement/turn speeds, movement/collision radii, and Ant camera offset/look height. Its `placement.offset.x/z` set the startup position relative to the hero tree; `offset.y` adds height above the support surface. The game adds `placement.lift` to keep the ant above terrain or water. Existing saves restore their saved ant position. Its recipe removes root motion and compiles idle, walk, eat, and cockroach-inspection ranges at startup. Walk uses frames 363-439 at 30 FPS before configured speed.

## Optional models

Quality gates control the cat and scattered flowers; disabling a gate removes its asset before GLB decoding. Flowers are optional decoration. The cat is required when `animatedCat` is enabled because the checklist uses it. Lollipop is a discovery objective, cockroach a controlled wanderer, and radio/reader/ant/lamp/tent are required.

## Add a model

1. Copy the GLB to `assets/models/` and add a `defineAsset()` entry in `js/content/assets.js`.
2. Set modes/required modes, width, orientation, placement strategy, lift, and animation. Use finite `placement.count` for deterministic, collision-aware scatter.
3. Use `fixed-ground` for one automatic static/looping asset, `scattered-ground` for repeated static instances, or a focused adapter for a unique actor.
4. Reserve fixed ground before `createGround()`; add game assets to the worker's `APP_SHELL`.
5. Update `docs/content-framework.md` for new strategies/evaluators. Add no asset without a scene use.

See `docs/content-framework.md` for placement strategies and recipes.
