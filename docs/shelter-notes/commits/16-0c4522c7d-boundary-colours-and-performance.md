# 16. gis: boundary, website colours, striped duplicates and a map that stays responsive

| | |
|---|---|
| Commit | `0c4522c7dd90f40d740e3435fc8f88ded6d0f92e` |
| Short | `0c4522c7d` |
| Date | 2026-09-19 |
| Phase | Phase 4 - field readiness |

## Why this exists

The largest single change, and the one that made the map usable on a real slum. The slum boundary is
drawn, filter colours match the Shelter website, duplicates are striped, and empty slums explain
themselves instead of showing a grey square. The performance work matters most: on a 1052-household
slum the filter list took minutes and froze the interface. Household answers are now read once into
a small table in chunks after the map is on screen, the page is built once per slum instead of
reloading on every filter change, and footprints are drawn on canvas - so a filter applies in about
300 ms.

## What the commit says

```
- Slum boundary drawn from the server's new "boundary"; empty or boundary-only slums say so instead
  of a grey map (turf.bbox of nothing gave a NaN centre that made Leaflet throw).
- Filter colours come from the GIS server's filter rows ("filters") with a 16-colour fallback palette
  that never repeats within one question; duplicates are striped; legend rows toggle their houses.
- Only server-chosen concepts ("map_filters") are offered; concepts and answers span registration,
  enrolment and visit forms the user may view.
- Household answers are read from Realm once into a small table, in chunks, after the map is on
  screen: the filter list took minutes and blocked the JS thread on a 1052-household slum, now it
  builds in the background and a filter applies in ~300 ms. The page HTML is built once per slum so
  filter changes no longer reload Leaflet; the page reads the GeoJSON file itself and draws footprints
  on canvas, so large slums neither cross the bridge as a string nor flood the DOM.
- Themed with Avni's Colors and AppHeader; slum and filter are dropdowns; house-number labels are
  optional; a household opens on top of the map so Back returns to it; sync keeps a good slum file when
  the server answers with less.
```

## Files touched

```
packages/openchs-android/src/gis/colorCoding.js    |  38 +-
 packages/openchs-android/src/gis/filterColors.js   |  16 +
 packages/openchs-android/src/gis/gisFile.js        |   7 +
 .../openchs-android/src/gis/householdSummary.js    |  19 +
 packages/openchs-android/src/gis/mapCenter.js      |  25 +
 packages/openchs-android/src/gis/mapData.js        |  73 +-
 .../openchs-android/src/gis/observationAnswers.js  |  68 +-
 .../openchs-android/src/service/GisSyncService.js  |  10 +-
 .../openchs-android/src/views/MapPickerScreen.js   | 753 ++++++++++++++-------
 .../openchs-android/test/gis/colorCodingTest.js    |  28 +-
 .../openchs-android/test/gis/filterColorsTest.js   |  27 +
 packages/openchs-android/test/gis/gisFileTest.js   |  21 +
 .../test/gis/householdSummaryTest.js               |  25 +
 packages/openchs-android/test/gis/mapCenterTest.js |  47 ++
 packages/openchs-android/test/gis/mapDataTest.js   |  86 ++-
 .../test/gis/observationAnswersTest.js             |  58 +-
 16 files changed, 964 insertions(+), 337 deletions(-)
```
