# Installation, saves, and offline play

`index.html` is the installable game entry. Serve the project over HTTPS or localhost to use service workers.

## Release metadata

`APP_VERSION` in `js/config/app.js` owns the release version. `js/main.js` displays it and registers `service-worker.js?v=<APP_VERSION>`. The worker's `RELEASE_VERSION`, package version, and lockfile version must match.

## Cache rules

The cache prefix is `the-quiet-pond-v`. Activation removes older releases with that prefix while preserving other applications' caches. Requests must belong to the worker's origin and scope. Reads use the current version's cache.

`APP_SHELL` includes `index.html`, CSS, manifest, icon, every reachable runtime module, local Three.js dependencies, models, and audio used by any profile. Add paths whenever a runtime dependency changes.

Only folder-root and `index.html` document navigation is handled. Offline navigation falls back to cached `index.html`, including query URLs such as `?q=mid`. Other document requests pass through.

## Browser storage

Progress is stored in `the-quiet-pond-saves-v1`; `the-quiet-pond-active-save-slot-v1` selects the active slot. Language is stored in `the-quiet-pond-language`, quality in `the-quiet-pond-quality`, and the optional FPS display preference in `the-quiet-pond-performance-diagnostic`.

The game reads and writes its own keys. Save format version 1 holds player position, world time, seed/ offering progress, and checklist state. Existing valid saves remain available across application updates.

Storage belongs to the site's origin: scheme, host, and port. Another origin has separate saves. Clearing browser site data removes locally stored progress.

## Update and device verification

1. Align release versions and update cache paths.
2. Run `npm run check` and `npm test`.
3. Load the game online and reload until About shows the current version.
4. Confirm the current worker controls the page, then install where supported.
5. Create a save, close the installed app, disconnect the network, and reopen it.
6. Check reload, models, movement, climbing, radio, a seed transition, and saving.

Headless tests verify shell paths and request handling with simulated APIs. Real installation, storage capacity, audio decoding, and offline use require browser/device checks.
