# 01. feat(gis): download slum building polygons after every successful sync

| | |
|---|---|
| Commit | `0354404e94aeee38dfd9ca4eefa1fa3a1ad7b7a9` |
| Short | `0354404e9` |
| Date | 2026-09-18 |
| Phase | Phase 1 - first working slice |

## Why this exists

The first piece of the integration. Before this, the app had no idea the GIS server existed.
It establishes the pattern everything else builds on: the footprints for a slum are fetched once,
during sync, and written to the phone's own storage, so the map never depends on a live connection
at the moment the surveyor needs it. It deliberately runs *after* the Avni sync has succeeded and
the sync lock is released, so a GIS problem can never damage or delay an Avni sync.

## What the commit says

```
Adds GisSyncService, which fetches a gzip GeoJSON FeatureCollection per Slum
AddressLevel from the Shelter Associates GIS server and stores it under
<DocumentDirectory>/gis/structures_<avniUuid>.json for offline use by the
map picker. SyncComponent.startSync() runs it once the Avni sync has
succeeded, after the sync lock is released.

Ported from the original GIS branch (legacy-zip-base) onto upstream master;
the debug alert in the service was replaced with General.logError.
```

## Files touched

```
.../openchs-android/src/service/AllServices.js     |  1 +
 .../openchs-android/src/service/GisSyncService.js  | 65 ++++++++++++++++++++++
 .../openchs-android/src/views/SyncComponent.js     |  5 ++
 3 files changed, 71 insertions(+)
```
