# 24. gis: stop the map button crashing a sync reset, and tidy the filter bar

| | |
|---|---|
| Commit | `b518f672a40393a19b357c3cf79a152311df02b6` |
| Short | `b518f672a` |
| Date | 2026-09-26 |
| Phase | Phase 6 - field feedback |

## Why this exists

The first release went to real users and came back with problems. The headline one was reported as
"changing a catchment logs the worker out", which turned out to be a native crash inside Realm
caused by querying the database from inside a render while a sync reset was deleting those same
tables. The rest of the commit addresses what testers found awkward: house numbers not in Avni's
format, the bottom bar sitting under the navigation buttons, filters needing horizontal scrolling,
a filter dropdown that showed three results, and only admin-chosen filters being offered.

## What the commit says

```
Changing a worker's catchment makes the server ask for a sync reset, which deletes every
table while the home screen keeps re-rendering. renderMapButton() asked Realm whether the
map was available from inside render(), so it read rows the wipe was deleting and faulted
inside Realm's memory-mapped file - a native SIGSEGV that killed the app and left the
worker back on the login screen, looking like a logout. Answer from the last known value
while a sync is running instead.

Also:
- pad a picked structure number to Avni's four digits (35 -> 0035, 22A -> 0022A)
- keep the bottom bar clear of the Android navigation buttons
- wrap the legend into content-sized chips instead of one horizontal strip
- let the filter dropdown scroll past three results
- split house-number labels into separate "all" and "filter" toggles
- offer every coded concept again, with the GIS server's chosen filters first
```

## Files touched

```
.../src/action/subject/SubjectRegisterActions.js   |   3 +-
 packages/openchs-android/src/gis/mapBrowser.js     |   9 ++
 packages/openchs-android/src/gis/mapData.js        |   5 +-
 .../openchs-android/src/gis/structureNumber.js     |  12 +++
 packages/openchs-android/src/views/LandingView.js  |   4 +-
 .../openchs-android/src/views/MapPickerScreen.js   | 101 ++++++++++++---------
 packages/openchs-android/src/views/MenuView.js     |   4 +-
 packages/openchs-android/test/gis/mapDataTest.js   |   7 +-
 .../test/gis/structureNumberTest.js                |  36 +++++++-
 9 files changed, 127 insertions(+), 54 deletions(-)
```
