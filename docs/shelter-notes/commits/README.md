# Commit-by-commit documentation

Every change the Shelter build carries on top of stock Avni, oldest first.
One file per commit. The first 25 were written on base upstream `9f7bda055`; upstream `3056a2145` was merged in on 2026-10-13 (see ../UPSTREAM_MERGES.md).

| # | Commit | Date | What it does |
|---|---|---|---|
| 01 | [`0354404e9`](01-0354404e9-download-slum-polygons.md) | 2026-09-18 | feat(gis): download slum building polygons after every successful sync |
| 02 | [`160491476`](02-160491476-map-picker-screen.md) | 2026-09-18 | feat(gis): add MapPickerScreen (Leaflet in WebView) for structure selection |
| 03 | [`761387a80`](03-761387a80-map-before-registration.md) | 2026-09-18 | feat(gis): open the map picker before a new registration |
| 04 | [`f872b1884`](04-f872b1884-prefill-number-and-record-mapping.md) | 2026-09-18 | feat(gis): pre-fill the household number from the picked structure and record the mapping |
| 05 | [`030f59be6`](05-030f59be6-config-from-build.md) | 2026-09-18 | gis: server URL and API key come from Config.js, not source |
| 06 | [`d325fbe9c`](06-d325fbe9c-one-structure-key.md) | 2026-09-18 | gis: one structureKey() for every house-number lookup |
| 07 | [`1e7ebd5e7`](07-1e7ebd5e7-coded-answers-by-datatype.md) | 2026-09-18 | gis: decide coded answers by concept datatype and support multi-select |
| 08 | [`bf7e462da`](08-bf7e462da-queue-mappings-on-disk.md) | 2026-09-18 | gis: queue structure mappings on disk and retry after every sync |
| 09 | [`c1d34f921`](09-c1d34f921-multi-slum-switching.md) | 2026-09-18 | gis: let a worker assigned to several slums switch between them on the map |
| 10 | [`6864dbcc2`](10-6864dbcc2-sync-progress.md) | 2026-09-18 | gis: show polygon download progress during sync |
| 11 | [`187d2759d`](11-187d2759d-test-config-override.md) | 2026-09-18 | gis: tests override GisConfig settings instead of mocking Config.js |
| 12 | [`153acee88`](12-153acee88-single-source-of-colour.md) | 2026-09-18 | gis: colorCoding.js is the single source of every map colour |
| 13 | [`81886ea0a`](13-81886ea0a-map-data-pure-functions.md) | 2026-09-18 | gis: mapData.js builds status, filters and answers for one slum |
| 14 | [`67d70842c`](14-67d70842c-runtime-filters-and-duplicates.md) | 2026-09-18 | gis: filter bar from the form, legend from the colour map, duplicate registrations |
| 15 | [`f4f457b7d`](15-f4f457b7d-hermes-function-source.md) | 2026-09-19 | gis: page-side structureKey as a string literal, Hermes has no function source |
| 16 | [`0c4522c7d`](16-0c4522c7d-boundary-colours-and-performance.md) | 2026-09-19 | gis: boundary, website colours, striped duplicates and a map that stays responsive |
| 17 | [`070b397f5`](17-070b397f5-bundle-leaflet-offline.md) | 2026-09-19 | gis: bundle Leaflet in the APK so the map draws offline |
| 18 | [`8bb680eca`](18-8bb680eca-browse-mode-entry-points.md) | 2026-09-19 | gis: open the slum map from home and the menu to look at registered households |
| 19 | [`684f5c47e`](19-684f5c47e-brand-mark-header.md) | 2026-09-19 | Shelter Associates × Avni brand mark on top-level screens |
| 20 | [`bf54b6b87`](20-bf54b6b87-ignore-signing-keystore.md) | 2026-09-19 | Ignore the Shelter signing keystore |
| 21 | [`12cbc8abb`](21-12cbc8abb-shelter-logos-flavour.md) | 2026-09-19 | Shelter logos in the generic flavour: dark on white screens, white on the header |
| 22 | [`7e9f48ddc`](22-7e9f48ddc-both-logos-side-by-side.md) | 2026-09-19 | Avni × Shelter Associates logos on the white screens, smaller mark in the header |
| 23 | [`adeb91b05`](23-adeb91b05-logo-placement-and-error-page.md) | 2026-09-19 | Start-up logos sit higher; error page shows both logos too |
| 24 | [`b518f672a`](24-b518f672a-crash-fix-and-filter-bar.md) | 2026-09-26 | gis: stop the map button crashing a sync reset, and tidy the filter bar |
| 25 | [`e1dba0e83`](25-e1dba0e83-server-driven-map-and-navigation.md) | 2026-09-26 | gis: let the server pick which registrations use the map, and keep the map alive across one |
| 26 | [`f299d8a8f`](26-f299d8a8f-filter-refresh-and-render-cost.md) | 2026-09-26 | gis: refresh the filter list with the map, and stop scanning Realm on every render |
| 27 | [`16899f61a`](27-16899f61a-merge-upstream-18-1.md) | 2026-10-13 | **merge** upstream/master 18.1 (`3056a2145`) — 135 commits, 1 conflict |
| 28 | [`9283dca4f`](28-9283dca4f-latest-sync-owns-the-map.md) | 2026-10-14 | gis: the newest sync owns the map, and a slum with no structures offers the extra-household flow |
| 29 | [`9cfb0f517`](29-9cfb0f517-legend-counts-and-collapse.md) | 2026-10-14 | gis: count every category in the map legend, and let the legend collapse |

## Phases

| Phase | Commits | Theme |
|---|---|---|
| 1 | 01-04 | First working slice: download footprints, draw the map, pick a house, record the link |
| 2 | 05-11 | Hardening: configuration, shared house-number handling, offline retry, multi-slum |
| 3 | 12-14 | Extraction into `src/gis` as tested pure functions |
| 4 | 15-18 | Field readiness: offline map, performance on large slums, browse mode |
| 5 | 19-23 | Branding - released as 1.0.0 |
| 6 | 24 | Field feedback: the Realm crash and interface problems |
| 7 | 25 | Configurability: server-driven map selection, navigation, houses off the map |
| 8 | 28-29 | The slum file follows the server: deletions and renumbering reach the map, no-structure slums get a screen, the legend counts and folds |
