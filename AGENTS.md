# Project guidance

- Do not start a static server or browser preview unless explicitly requested. Ask the user to verify browser behavior.
- index.html is the game entry and js/main.js owns startup, DOM input, HUD, save slots, and language selection.
- Keep configuration in js/config/, content definitions in js/content/, and gameplay controllers in js/game/.
- js/core/ owns the world runtime and must not import js/game/. Inject game tuning as data and use public runtime APIs.
- Add models through js/content/assets.js with source, size, degree orientation, placement, animation, and runtime-role metadata.
- Preserve index.html?q=low|mid|full and High Quality world generation. Full is the visual reference.
- Preserve authored composition, antialiasing, the cat, rain, and core water behavior. Reduce rendering cadence, resolution, and decorative work first.
- Avoid per-frame object allocation, model traversal, and unbounded raycasts. Build collision proxies and reusable data at startup.
- Keep Three.js project-local. Preserve Water.dispose() and Water.getRenderTarget() when updating it.
- Add every game runtime module and asset to the service-worker pre-cache.
- js/config/app.js owns the version. Align package metadata and service-worker RELEASE_VERSION.
- Use `the-quiet-pond` as the kebab-case package and storage namespace. Restrict cache cleanup to `the-quiet-pond-v` names.
- Update README and relevant docs for controls, configuration, ownership, content, localization, quality, or offline changes.
- Run npm run check and npm test for relevant changes. Distinguish headless checks from browser/device proof.
- Use narrow rg or rg --files searches.
