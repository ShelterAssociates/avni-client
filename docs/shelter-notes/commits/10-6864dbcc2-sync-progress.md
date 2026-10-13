# 10. gis: show polygon download progress during sync

| | |
|---|---|
| Commit | `6864dbcc2b3424839cdd8f72dc5fe488d733caf5` |
| Short | `6864dbcc2` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

Makes the GIS half of the sync visible. Downloading several slums takes time, and without feedback
the sync screen looked frozen. One slum failing now reports itself and the rest continue, keeping
whatever was previously downloaded.

## What the commit says

```
GisSyncService reports one line per step through the sync screen's
existing message callback ('Downloading map 2/4: Baliram Nagar', how many
mapping links are still queued, and a final per-slum summary). A slum whose
download fails is counted and reported instead of aborting the rest, and
the previously saved copy is kept.
```

## Files touched

```
.../openchs-android/src/service/GisSyncService.js  | 43 ++++++++++++++--------
 .../openchs-android/src/views/SyncComponent.js     |  2 +-
 2 files changed, 29 insertions(+), 16 deletions(-)
```
