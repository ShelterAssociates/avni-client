# 06. gis: one structureKey() for every house-number lookup

| | |
|---|---|
| Commit | `d325fbe9ca5e96e066db0ff9c9ae40f28a342d4e` |
| Short | `d325fbe9c` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

House numbers arrive in three spellings - Avni's padded `0035`, the GIS server's `35`, and whatever
the worker types. Five separate hand-written comparisons had already drifted apart, including one
inside the Leaflet page. This reduces them all to a single function, shared with the page, so a
lookup can never half-work again.

## What the commit says

```
'0035' (Avni firstName), '35' (Component.housenumber) and whatever the
worker types in the search box all reduce to the same canonical key, the
same way the Django side's household_number_from() does. Replaces five
hand-copied try-three-variants lookups in MapPickerScreen (status map,
concept map, search, tap, and the Leaflet norm()) — the RN and Leaflet
copies had already drifted apart. The Leaflet page gets the exact same
function via STRUCTURE_KEY_SOURCE, which a test re-evaluates as a plain
script to prove it survives the trip. Covers leading zeros, alphanumeric
suffixes, non-numeric ids and blank/null names.
```

## Files touched

```
.../openchs-android/src/gis/structureNumber.js     | 26 ++++++++
 .../openchs-android/src/views/MapPickerScreen.js   | 74 +++++-----------------
 .../test/gis/structureNumberTest.js                | 47 ++++++++++++++
 3 files changed, 90 insertions(+), 57 deletions(-)
```
