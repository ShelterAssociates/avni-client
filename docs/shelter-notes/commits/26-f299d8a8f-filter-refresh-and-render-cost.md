# 26. gis: refresh the filter list with the map, and stop scanning Realm on every render

| | |
|---|---|
| Commit | `f299d8a8f7534b288942e6554d0470a68908a7c0` |
| Short | `f299d8a8f` |
| Date | 2026-09-26 |
| Phase | Phase 6 - field feedback |

## Why this exists

A surveyor who registered a house saw the map repaint, but the filter list beside it did not: its
counts and the active filter's colours stayed as they were until the screen was closed and reopened.
The refresh only ever rebuilt the status map, not the catalogue the filter list is drawn from.

The same commit removes two costs that were being paid on every render rather than once. The home
screen asked Realm whether the map was available each time it drew, which measured 16ms of queries,
and the screen re-renders on every sync message. The map screen likewise derived its structure list
on each render and each keystroke in the search box.

## What the commit says

```
Registering a house repainted the map but left the filter list, its counts and the
active filter's colours as they were until the screen was closed and reopened: the
refresh rebuilt only the status map. It now rebuilds the catalogue and re-applies the
active filter, still keyed on household count, queue size and last sync so unchanged
data stays a cache hit.

- accept letters in the search box and the extra-house prompt; a numeric keypad could
  not type 22A, which the padding has supported all along
- decide the home screen's map button once per sync instead of once per render; it cost
  16ms of Realm queries and the screen renders on every sync message
- derive the structure list once per slum file rather than on every render and keystroke
```

## Files touched

```
 .../openchs-android/src/gis/extraHouseholds.js     |  4 --
 packages/openchs-android/src/gis/mapBrowser.js     | 11 +++-
 .../openchs-android/src/views/MapPickerScreen.js   | 62 +++++++++++++++-------
 .../test/gis/extraHouseholdsTest.js                | 13 +----
 4 files changed, 54 insertions(+), 36 deletions(-)
```

## Note

This was the last Shelter commit before the 2026-10-13 merge of upstream `3056a2145`. See
[`../UPSTREAM_MERGES.md`](../UPSTREAM_MERGES.md) for what that merge brought in.
