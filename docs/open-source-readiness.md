# Open-source readiness review

Reviewed locally on 2026-09-06 for version 1.4.3. Recommendation: do not publish the full bundle as an unrestricted open-source game yet.

## Release blockers

- No root license for the original code. Select a license and identify the copyright holder. The Three.js license only covers the vendored library. [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
- Embedded GLB `asset.extras` metadata identifies the licenses below. This is evidence supplied with the downloaded files, not independent verification of authorship or additional permissions. Preserve creator, source URL, license, and modification notices in a distributable attribution manifest.

| Model | Embedded creator | Embedded license |
| --- | --- | --- |
| ant.glb | MAXDESIGN-3D | CC BY 4.0 |
| an_animated_cat.glb | Evil_Katz | CC BY 4.0 |
| cockroach.glb | Drillimpact | CC BY 4.0 |
| common_frog.glb | kenchoo | CC BY-NC-SA 4.0 |
| generic_narcissus_flower.glb | assetfactory | Sketchfab Standard |
| lollipop.glb | pmr1003 | CC BY 4.0 |
| old_radio.glb | jorgenix | Sketchfab Standard |
| purple_flower.glb | PropShop | CC BY 4.0 |
| quiet_reading.glb | restore50 | CC BY 4.0 |
| street_light_lamp.glb | amurin | CC BY 4.0 |
| tent.glb | Tactical_Gamer | CC BY 4.0 |

The frog's [CC BY-NC-SA terms](https://creativecommons.org/licenses/by-nc-sa/4.0/) restrict commercial use and require share-alike treatment of adaptations. It cannot simply be covered by a permissive code license. Replace it or clearly separate its restrictions; replacement is preferable for a freely reusable game bundle.

The radio and narcissus metadata links to [Sketchfab's license terms](https://sketchfab.com/licenses). The terms page returned HTTP 403 during this review, so raw-file redistribution permission remains unverified. Obtain applicable terms and permission or replace these assets before publishing them in a public repository.

Music has generic YouTube Audio Library credits but no per-track title, creator, or license records in the reviewed project documentation. Verify permission to redistribute the MP3 files in a game repository. YouTube's [Audio Library guidance](https://support.google.com/youtube/answer/3376882?hl=en-GB) describes video use and distinguishes Creative Commons from standard library licenses; it does not establish permission for this particular bundle. Document provenance and applicable terms for generated voices and the icon as well.

## Engineering status

- Project validation, movement tests, objective tests, and offline-shell tests pass.
- The new cockroach objective covers moving targets, missing targets, pause, linger reset, completion, old saves, and checklist cache signatures in headless tests.
- Browser and phone verification is still required, including all quality profiles and offline reloads. No server or preview was started for this review.
- The folder is not currently a Git repository. No root .gitignore, CI workflow, or contributing guide was found. These are useful preparation steps before inviting contributors.
- A limited source-text credential scan found no matching credential markers; this is not a complete security audit or Git-history scan.
- The largest current file is quiet_reading.glb at about 48.68 MiB. Plan asset distribution and download size before release.

Choose the code license, replace or clear restricted assets, publish complete asset notices, then verify the playable release on desktop and phone. No code license was chosen and no files were published as part of this review.
