# Content framework

The Quiet Pond uses plain JavaScript registries that are compiled once during startup. This keeps content easy to extend without adding schema work to the render loop or introducing another runtime dependency.

## Main files

- `js/content/assets.js` owns imported 3D asset definitions.
- `js/content/messages.js` owns content-first localization entries and compiles language catalogs once at startup.
- `js/content/objectives.js` owns checklist metadata and evaluator names.
- `js/config/quality.js` owns the `full`, `mid`, and `low` render profiles.
- `js/config/` owns focused game tuning. `js/config/game.js` composes it into `POND_GAME`.
- `js/config/index.js` provides scene settings and compiles model configuration.

The registries are ordinary JavaScript instead of JSON. This allows module-relative asset URLs, comments, frozen values, and small build-time helpers without another file request.

## Add a 3D asset

Put the GLB in `assets/models/`, then add a `defineAsset()` entry to `ASSET_CATALOG` in `js/content/assets.js`.

```js
acorn: defineAsset({
  file: 'acorn.glb',
  label: 'Acorn beside the roots',
  size: { width: 0.18 },
  orientation: {
    yawDegrees: 25,
    yawOffsetDegrees: 90,
    rotationDegrees: { x: 0, y: 0, z: 0 },
  },
  placement: {
    strategy: 'fixed-ground',
    position: { x: -6.2, z: 4.65 },
    lift: 0.004,
    clearingRadius: 0.2,
  },
  animation: {
    clip: 'Idle',
    frames: [0, 90],
    framesPerSecond: 30,
    speed: 1,
  },
  modes: ['game'],
  requiredModes: ['game'],
}),
```

Fields have these meanings:

- `file` is relative to `assets/models/`.
- `size.width` is the final horizontal width in scene units.
- `orientation.yawDegrees` is the authored world heading.
- `orientation.yawOffsetDegrees` corrects the model's forward axis.
- `orientation.rotationDegrees` supports X, Y, and Z correction for an imported model that needs to lie down or roll.
- `placement.strategy` documents which placement adapter owns the instance.
- `placement.position`, `anchor`, or `relativeTo` identifies its authored location source. Specialized adapters interpret `anchor` and `relativeTo`; they are not automatic generic resolvers.
- `placement.offset` applies an authored X, Y, and Z offset from the selected anchor.
- `placement.pondAngle` and `placement.pondInset` select a point from a generated pond profile.
- `placement.lift` is the persistent surface-contact correction.
- `placement.clearingRadius` reserves ground and vegetation clearance where that placement strategy supports it.
- `placement.count` enables deterministic scattered instances. Omit it for a single fixed or specialized actor.
- `animation.clip` selects one clip by index or name. `animation.frames` selects one range for automatic `fixed-ground` playback.
- `animation.clips` and `animation.speeds` name several states for a focused actor adapter.
- `animation.ranges` declares reusable frame ranges, while `framesPerSecond` makes their timing explicit.
- `requires` names a Boolean quality-profile feature gate. Every profile must declare that gate.
- `runtime` carries role-specific tuning that is compiled into the flat runtime view.
- `modes` lists every runtime where the descriptor is included and its GLB is requested. It defaults to `game`; the runtime and validator support game mode.
- `requiredModes` is a subset of `modes` where a missing or invalid GLB must stop startup. A mode listed only in `modes` treats that load failure as optional, reports it, and continues without the asset. It defaults to an empty list, which is appropriate for purely decorative assets.

In the example, game mode loads and requires the acorn. Keep every `requiredModes` entry in `modes`; the project validator rejects a required mode where the asset is not loaded.

Definitions compile into the runtime `SCENE_PROPS` shape. Generators and runtime code therefore do not perform registry lookups per frame.

## Placement strategies

The current content uses these strategy names:

- `ground-offset` for an offset from the hero tree area.
- `pond-rock` for the authored radio rock anchor.
- `tree-anchor` for a branch or perch anchor.
- `pond-edge` for a point derived from the pond profile.
- `habitat-corner` for the corner lamp.
- `relative-ground` for a ground point relative to another authored asset.
- `scattered-ground` for seeded placement generated before rocks and vegetation.
- `ground-wanderer` for a controlled actor that chooses terrain destinations.
- `fixed-ground` for a single static or looping animated asset at an authored X and Z position.
- `game-anchor` for a position reserved by game configuration.

Specialized actors still use focused placement methods because the radio proxy, reader proxy, lamp light, tent blocker, ant controller, cat animation, and cockroach walker have distinct lifecycles. `fixed-ground` is handled automatically for a single simple asset, including one optional looping clip or frame range. `scattered-ground` is handled automatically for static repeated assets. A unique actor with lights, gameplay behavior, movement, collision proxies, or multiple animation states should get a small named adapter instead of another unrelated branch in the world builder.

Ground clearings must be compiled before `createGround()`. Visible instances are placed after the ground, trees, pond, and rock anchors exist. Reversing that order changes deterministic placement and collision behavior.

## Animation clips and frame ranges

Animation recipes live beside the asset definition and are compiled once. The ant demonstrates named frame ranges:

```js
animation: {
  clip: 0,
  speed: 3.6,
  framesPerSecond: 30,
  ranges: {
    idle: [200, 360],
    walk: [363, 439],
    eat: [440, 776],
    cockroach: [1415, 1700],
  },
},
```

`js/props/model-animation.js` resolves a clip by index or name, clones ordinary clips, removes configured root-motion tracks, and creates frame subclips. Do this during startup, not while rendering. Use explicit degrees for authored orientation and explicit frames per second for frame ranges.

A simple `fixed-ground` asset automatically loops `animation.clip`, or the optional single `animation.frames` range. Named `clips`, `speeds`, and `ranges` are for focused actors with several states, such as idle, walk, and interaction.

## Localized text

Author each stable key once in `MESSAGE_DEFINITIONS`, with every supported language beside it.

```js
'objective.acorn': defineMessage({
  en: 'Find the acorn',
  id: 'Temukan biji ek',
}),
```

Add the language code to `SUPPORTED_LANGUAGES`, then add that property to every message definition. Module initialization reports a missing translation immediately. The definitions compile once into the language-first `MESSAGE_CATALOG`, so `translateMessage(key, language, parameters)` keeps direct object lookup and supports placeholders such as `{version}`. `js/ui/localization.js` formats dynamic landmarks and UI labels using the same catalog.

Use `data-i18n="ui.example"` for element text and `data-i18n-aria-label="ui.example.aria"` for accessible labels in `index.html`. Dynamic browser code should call `translate()` or `translateMessage()` with the stable key and parameters. The validator checks every localization key referenced by game markup.

Discovery speech and the final checklist caption also use stable `interaction.*` keys. `js/config/content.js` stores those keys, not separate language objects, so every localized line stays in one catalog and locale parity remains testable.

Add the key to every supported language. Keep `Resume` and `Restart` in English as an intentional game UI exception.

## Add an objective

Add metadata to `GAME_OBJECTIVES` in `js/content/objectives.js`.

```js
defineObjective({
  id: 'acorn',
  labelKey: 'objective.acorn',
  evaluator: 'proximity3d',
  target: 'acorn',
  radiusKey: 'acornRadius',
}),
```

The existing evaluators are:

- `proximity2d` for ground-plane distance.
- `proximity3d` for elevated targets.
- `shelter` for tent or burrow shelter bounds.
- `pondSurface` for a valid point on the water surface.

Availability can be `always`, `raining`, `night`, or `fireflyWindow`. Add the matching radius or time tuning under `OBJECTIVE_TUNING` in `js/config/content.js`.

An objective with unique behavior may add a small evaluator branch in `PondGameObjectives`. Completion side effects such as an animation or object removal remain explicit runtime handlers.

The cockroach meeting uses `proximity3d` and `cockroachMeetRadius` (0.6 world units) with the shared 1.2-second linger time. The controller refreshes its target through `getCockroachWorldPosition()` using a reusable vector before evaluating objectives. The existing close-range reaction animation keeps its separate `cockroachRadius`. The cockroach asset is required for gameplay because checklist completion depends on it. Saves store objective IDs, so older saves gain the new task as incomplete. Snapshot signatures reserve completion bits based on the current managed objective count.

## Performance rules

- Compile descriptors, URLs, frame clips, and task definitions at startup.
- Keep direct object references in controllers after startup.
- Do not traverse a GLB, parse messages, validate schemas, or allocate task snapshots every frame.
- Load independent models in parallel.
- Keep deterministic clearing creation before rock and vegetation generation.
- Use `q=low`, `q=mid`, and `q=full` for workload differences. All profiles retain High Quality scene generation.
- Add every game runtime module and asset to the service-worker pre-cache.

Static checks can validate file paths, imports, descriptor fields, and cache coverage. They cannot prove model orientation, animation appearance, collision feel, frame rate, or offline behavior on a device.
