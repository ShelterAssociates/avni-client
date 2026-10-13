# 13. gis: mapData.js builds status, filters and answers for one slum

| | |
|---|---|
| Commit | `81886ea0ad7492b886237c02481c8637ad58d22c` |
| Short | `81886ea0a` |
| Date | 2026-09-18 |
| Phase | Phase 3 - extraction into src/gis |

## Why this exists

Moves the thinking out of the screen and into pure, tested functions: which houses are registered,
which are registered twice, which questions are worth offering as filters, and what colour each
answer gets. Testable in isolation, which is what makes the later behaviour changes safe.

## What the commit says

```
Pure functions over the households of one slum: buildStatusMap (two or
more registrations on one house number = duplicate), buildFilterCatalog
(one filter per coded question on the registration form that somebody in
this slum actually answered, in form order, only when the user's groups
hold the view-subject privilege for the type; plus a Duplicates filter
when any exist), applyConceptFilter / applyDuplicateFilter (answer map +
colours). Question-group children are not searched (documented).
```

## Files touched

```
packages/openchs-android/src/gis/mapData.js      | 119 +++++++++++++++++++++++
 packages/openchs-android/test/gis/mapDataTest.js | 117 ++++++++++++++++++++++
 2 files changed, 236 insertions(+)
```
