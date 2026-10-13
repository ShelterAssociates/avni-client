# 02. feat(gis): add MapPickerScreen (Leaflet in WebView) for structure selection

| | |
|---|---|
| Commit | `160491476043146e22d95d0ee9b8099574c6878f` |
| Short | `160491476` |
| Date | 2026-09-18 |
| Phase | Phase 1 - first working slice |

## Why this exists

The map itself. A full-screen satellite view of the slum with every building drawn from the file
the previous commit downloaded, coloured by whether anyone is registered there. This is the change
that turns "type the house number" into "tap the house you are standing at". Leaflet runs inside a
WebView because it draws thousands of polygons far better than React Native views can.

## What the commit says

```
Full-screen satellite map of the field worker's slum built from the locally
synced GeoJSON. Polygons are colour-coded by survey status (green = not
surveyed, orange = registered, blue = selected, purple = search hit) and can
be re-coloured by the answers to a Household concept via the filter bar.
Tapping a polygon and confirming hands the structure number (and, if already
registered, the subject UUID) back through CHSNavigator.invokeMapPickerCallback.

Registered at /mapPickerScreen via views/index.js. Adds @turf/turf (bbox).
Ported verbatim from the original GIS branch (legacy-zip-base).
```

## Files touched

```
packages/openchs-android/package-lock.json         | 2989 +++++++++++++++++++-
 packages/openchs-android/package.json              |    1 +
 .../openchs-android/src/views/MapPickerScreen.js   |  762 +++++
 packages/openchs-android/src/views/index.js        |    3 +-
 4 files changed, 3753 insertions(+), 2 deletions(-)
```
