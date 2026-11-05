# Installation, saves, and offline play

`index.html` is the installable entry. Service workers require HTTPS or localhost.

## Release metadata

`js/config/app.js` owns `APP_VERSION`; `js/main.js` displays it and registers `service-worker.js?v=<APP_VERSION>`. Keep the worker's `RELEASE_VERSION`, `package.json`, and lockfile versions aligned.

## Cache rules

Cache prefix: `the-quiet-pond-v`. Activation removes only older matching releases, preserving other apps' caches. Requests must match worker origin/scope; reads use the current version's cache.

`APP_SHELL` lists `index.html`, CSS, manifest, icon, all game runtime imports, local Three.js dependencies, models, and audio. Underground layout, generation, and map dependencies are installed with the application shell. Add new runtime dependencies to this registry.

The release build splits ES modules and pre-caches every generated runtime chunk, including dynamic imports used during startup. There is no optional underground cache group or entry notification. See [underground.md](underground.md) for verification.

Only root and `index.html` document navigation is handled. Offline requests, including `?q=mid`, fall back to cached `index.html`; other document requests pass through.

## Browser storage

| Data | Browser key |
| --- | --- |
| Saves | `the-quiet-pond-saves-v1` |
| Active slot | `the-quiet-pond-active-save-slot-v1` |
| Language | `the-quiet-pond-language` |
| Quality | `the-quiet-pond-quality` |
| FPS diagnostic | `the-quiet-pond-performance-diagnostic` |

The game accesses only its own keys. Save format v1 stores player position, world time, seed/offering progress, and checklist state. Valid saves persist across app updates.

Storage is origin-specific (scheme, host, port); another origin has separate saves. Clearing site data deletes local progress.

## Update and device verification

1. Align release versions and cache paths; run `npm run check` and `npm test`.
2. Load online and reload until About shows the current version; confirm the current worker controls the page.
3. Install where supported, create a save, close the app, disconnect, and reopen it.
4. Check reload, models, movement, climbing, radio, a seed transition, and saving.

Headless tests cover shell paths and simulated requests. Verify installation, storage capacity, audio decoding, and offline use in a real browser/device.
