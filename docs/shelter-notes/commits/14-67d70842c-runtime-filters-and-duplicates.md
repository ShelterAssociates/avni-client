# 14. gis: filter bar from the form, legend from the colour map, duplicate registrations

| | |
|---|---|
| Commit | `67d70842c9abd40067bc2897039327ab82e8753e` |
| Short | `67d70842c` |
| Date | 2026-09-18 |
| Phase | Phase 3 - extraction into src/gis |

## Why this exists

Replaces three hardcoded question names with filters built at runtime from the forms the worker can
actually see, and only for questions somebody in this slum has answered. Duplicate registrations -
two workers registering the same house offline - become visible: the house is striped, a Duplicates
filter appears, and tapping it lists the households so a supervisor can sort it out.

## What the commit says

```
MapPickerScreen now builds its filter chips at runtime from the coded
questions of the subject type's registration form that have data in the
slum on screen (catchment = synced slums; answer filters only when the
user's groups may view the subject type), instead of three hardcoded
concept names. Every colour, on the RN side and inside the Leaflet page,
comes from colorCoding.js; the legend is rendered straight from the
answerColors map the polygons use, so it cannot go stale.

Duplicates: when two workers register the same house number offline and
both sync, the structure turns red on the status layer, a Duplicates chip
appears ('2 registrations', '3 registrations', ...), and tapping the
structure lists the households so a supervisor can open either one.

Status and filters are scoped to the subject type being registered
(navigateToMapPicker now takes {slums, initialSlumUuid, subjectTypeName}).
```

## Files touched

```
.../openchs-android/src/utility/CHSNavigator.js    |   8 +-
 .../openchs-android/src/views/MapPickerScreen.js   | 515 ++++++++++-----------
 packages/openchs-android/src/views/RegisterView.js |   3 +-
 3 files changed, 244 insertions(+), 282 deletions(-)
```
