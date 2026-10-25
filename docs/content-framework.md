# Content framework

Content uses plain JavaScript registries compiled once at startup, avoiding render-loop schema work and extra dependencies.

## Main files

- `js/content/assets.js`: imported 3D models.
- `js/content/messages.js`: localization entries and language catalogs.
- `js/content/objectives.js`: checklist metadata and evaluators.
- `js/config/quality.js`: `full`, `mid`, and `low` render profiles.
- `js/config/`: focused game tuning; `game.js` composes `POND_GAME`.
- `js/config/index.js`: scene settings and compiled model configuration.

JavaScript registries support module-relative asset URLs, comments, frozen values, and small helpers without extra file requests.

## Add a 3D asset

Put the GLB in `assets/models/`, then add a `defineAsset()` entry to `ASSET_CATALOG` in `js/content/assets.js`.

For a model used only by an optional gameplay mode, `runtime.loadOnDemand: true` defers decoding until `PondApp.loadDeferredModel(id)` is called. Keep its asset in the offline pre-cache. The bird uses this path; preparation failure is reported when selected, while ant play remains available.

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

| Field | Meaning |
| --- | --- |
| `file` | GLB path relative to `assets/models/` |
| `size.width` | Final horizontal width in scene units |
| `orientation.yawDegrees` / `yawOffsetDegrees` | Authored heading / forward-axis correction |
| `orientation.rotationDegrees` | X/Y/Z import correction, including laying down or rolling |
| `placement.strategy` | Adapter that owns placement |
| `placement.position`, `anchor`, `relativeTo` | Authored location; specialized adapters interpret anchors, not a generic resolver |
| `placement.offset` | Authored X/Y/Z offset from the selected anchor |
| `placement.pondAngle`, `pondInset` | Point on the generated pond profile |
| `placement.lift` | Persistent support-surface contact correction |
| `placement.clearingRadius` | Ground/vegetation clearance where supported |
| `placement.count` | Deterministic scatter count; omit for one fixed/specialized actor |
| `animation.clip`, `frames` | Clip by index/name; one range for automatic `fixed-ground` playback |
| `animation.clips`, `speeds`, `ranges` | Named actor states, speeds, and reusable frame ranges |
| `framesPerSecond` | Explicit frame-range timing |
| `requires` | Boolean quality feature gate declared by every profile |
| `runtime` | Role-specific tuning compiled into the flat runtime view |
| `modes` | Modes that include/request the descriptor; defaults to supported `game` mode |
| `requiredModes` | Subset of `modes` where missing/invalid GLB stops startup; defaults empty. Other load failures are reported and skipped. |

The example requires the acorn in game mode. The validator enforces `requiredModes` as a subset of `modes`. Definitions compile to `SCENE_PROPS`, avoiding per-frame registry lookups.

## Placement strategies

| Strategy | Placement |
| --- | --- |
| `ground-offset` | Offset from hero-tree area |
| `pond-rock` | Authored radio-rock anchor |
| `tree-anchor` | Branch/perch anchor |
| `pond-edge` | Pond-profile point |
| `habitat-corner` | Corner lamp |
| `relative-ground` | Ground point relative to another asset |
| `scattered-ground` | Seeded placement before rocks/vegetation |
| `ground-wanderer` | Actor chooses terrain destinations |
| `fixed-ground` | One static/looping asset at authored X/Z |
| `game-anchor` | Position reserved by game configuration |

Radio/reader proxies, lamp light, tent blocker, ant controller, cat animation, and cockroach walker keep focused adapters because their lifecycles differ. `fixed-ground` handles one simple asset and optional looping clip/range; `scattered-ground` handles repeated static assets. Give unique actors with lights, gameplay, movement, collision proxies, or multiple states a named adapter, not another world-builder branch.

Compile clearings before `createGround()` so vegetation respects them. Place visible instances after ground, trees, pond, and rock anchors exist; changing this order affects deterministic placement and collisions.

## Animation clips and frame ranges

Animation recipes live beside asset definitions and compile once. The ant uses named frame ranges:

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

`js/props/model-animation.js` resolves clip index/name, clones ordinary clips, removes configured root-motion tracks, and creates subclips at startup. Use degrees for orientation and explicit FPS for ranges.

Simple `fixed-ground` assets loop `animation.clip` or one optional `animation.frames` range. Named `clips`, `speeds`, and `ranges` serve multi-state actors such as idle/walk/interaction.

## Localized text

Define each stable key and all supported languages in `MESSAGE_DEFINITIONS`:

```js
'objective.acorn': defineMessage({
  en: 'Find the acorn',
  id: 'Temukan biji ek',
}),
```

Add new language codes to `SUPPORTED_LANGUAGES` and every definition; startup reports missing translations. Definitions compile once into language-first `MESSAGE_CATALOG` for direct `translateMessage(key, language, parameters)` lookup and placeholders such as `{version}`. `js/ui/localization.js` uses the same catalog for dynamic landmarks and UI labels.

Use `data-i18n` for text and `data-i18n-aria-label` for accessible labels in `index.html`; browser code calls `translate()` or `translateMessage()` with stable keys/parameters. Validation checks markup keys.

Discovery speech and the final checklist caption use `interaction.*` keys stored in `js/config/content.js`, not per-language objects, keeping locale parity testable. Add each key to every supported language. `Resume` and `Restart` intentionally remain English.

## Add an objective

Add metadata to `GAME_OBJECTIVES` in `js/content/objectives.js`.

```js
defineObjective({
  id: 'acorn',
  labelKey: 'objective.acorn',
  hintKey: 'objective.acorn.hint', // Optional. Shown below the label until completion.
  evaluator: 'proximity3d',
  target: 'acorn',
  radiusKey: 'acornRadius',
}),
```

When an objective has a `hintKey`, add its translated message in `js/content/messages.js`. The checklist renders these hints generically and hides them after that objective is complete.

| Evaluator | Checks |
| --- | --- |
| `proximity2d` | Ground-plane distance |
| `proximity3d` | Elevated-target distance |
| `shelter` | Tent/burrow shelter bounds |
| `pondSurface` | Valid water-surface point |

Availability is `always`, `raining`, `night`, or `fireflyWindow`. Add matching radius/time tuning to `OBJECTIVE_TUNING` in `js/config/content.js`.

Unique checks may add a small `PondGameObjectives` evaluator branch. Completion effects (animation/removal) stay in explicit runtime handlers.

Cockroach meeting uses `proximity3d`, `cockroachMeetRadius` (0.6 units), and the shared 1.2-second linger. The controller refreshes the target with `getCockroachWorldPosition()` and a reusable vector; close-range reaction uses separate `cockroachRadius`. The required cockroach asset supports this objective. Saves store IDs, so old saves gain it as incomplete; snapshot signatures size completion bits to the managed objective count.

## Performance rules

- Compile descriptors, URLs, frame clips, and task definitions at startup.
- Keep direct object references in controllers after startup.
- Do not traverse a GLB, parse messages, validate schemas, or allocate task snapshots every frame.
- Load independent models in parallel.
- Keep deterministic clearing creation before rock and vegetation generation.
- Use `q=low`, `q=mid`, and `q=full` for workload differences. All profiles retain High Quality scene generation.
- Add every game runtime module and asset to the service-worker pre-cache.

Static checks can validate file paths, imports, descriptor fields, and cache coverage. They cannot prove model orientation, animation appearance, collision feel, frame rate, or offline behavior on a device.
