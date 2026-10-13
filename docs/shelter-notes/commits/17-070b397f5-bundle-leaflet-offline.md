# 17. gis: bundle Leaflet in the APK so the map draws offline

| | |
|---|---|
| Commit | `070b397f55f3d0dbe2c6264c18bf127a470507d6` |
| Short | `070b397f5` |
| Date | 2026-09-19 |
| Phase | Phase 4 - field readiness |

## Why this exists

Makes the map genuinely offline. Leaflet was being fetched from a CDN, so with no network there was
no map at all - which is precisely the situation the surveyor is usually in. The library now ships
inside the app, with the CDN kept only as a fallback. Satellite imagery still needs a connection,
and the app says so.

## What the commit says

```
Leaflet came from unpkg, so without network there was no map at all. Gradle now copies leaflet.js and
leaflet.css from node_modules into the assets; the page falls back to the CDN only when the asset is
missing and tells the app when neither loads. Satellite tiles still need the network.
```

## Files touched

```
packages/openchs-android/android/app/build.gradle | 8 ++++++++
 packages/openchs-android/package-lock.json        | 7 +++++++
 packages/openchs-android/package.json             | 1 +
 3 files changed, 16 insertions(+)
```
