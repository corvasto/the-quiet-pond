# Scene customization

## Deterministic scene edits

`DEFAULTS.seed` controls procedural generation. Keep the seed and the order of seeded random requests unchanged when an existing camera sequence must keep the same composition.

Adding or removing scattered procedural items can shift later seeded results if it changes request order. Make one change at a time and verify the starter timeline after each edit.

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

- `size.width` sets model width in scene units.
- `placement.offset.x` and `.z` move across the authored ground or anchor space.
- `placement.offset.y` is intentional vertical placement.
- `placement.lift` corrects contact with the support surface.
- `orientation.yawDegrees` sets the authored heading.
- `orientation.yawOffsetDegrees` corrects the model's forward axis.
- `orientation.rotationDegrees` applies X, Y, and Z import correction.
- `modes` controls game loading.
- `requiredModes` makes a missing gameplay-critical GLB fail startup clearly.

Edit one value, reload, and compare the same camera frame. Keep `lift` for contact correction and use `offset.y` for intentional placement.

## Ant tuning

The ant asset definition includes:

- visual width and placement
- walk clip frame range
- animation speed
- movement speed
- turn speed
- movement and collision radii
- Ant camera offset and look height

The existing animation recipe removes ant root motion and compiles idle, walk, eat, and cockroach-inspection frame ranges once during startup. The walk action uses frames 363 through 439 at 30 fps before applying the configured speed.

## Optional models

The cat and scattered flowers are controlled by quality feature gates. Disabling a gate removes its definition from the load plan before GLB decoding. Flowers remain optional decorative assets. The cat is required in modes where `animatedCat` is enabled because the game checklist references it.

The lollipop is a discovery objective. The cockroach has a controlled wanderer role. Radio, reader, ant, lamp, and tent are required assets.

## Add a model

1. Copy the GLB into `assets/models/`.
2. Add one `defineAsset()` entry to `ASSET_CATALOG` in `js/content/assets.js`.
3. Declare modes, required modes, width, orientation, placement strategy, lift, and animation recipe.
4. Use a finite `placement.count` for deterministic collision-aware scattering.
5. Use `fixed-ground` for one automatic static or looping asset, `scattered-ground` for repeated static instances, or add one focused adapter for a genuinely unique runtime actor.
6. Reserve fixed ground before `createGround()` so vegetation respects the footprint.
7. Add every game-mode asset to `APP_SHELL` in `service-worker.js`.
8. Update `docs/content-framework.md` if a new strategy or evaluator is introduced.

See `docs/content-framework.md` for complete recipes. Do not add a model asset without a scene use.
