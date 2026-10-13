# 29. gis: count every category in the map legend, and let the legend collapse

| | |
|---|---|
| Commit | `9cfb0f517` |
| Date | 2026-10-14 |
| Phase | Phase 8 - the slum file follows the server |

## Why this exists

The legend told a surveyor which colour meant what, and nothing else. Standing in a slum of 1786
structures, "Registered" in orange does not answer the question actually being asked — *how many*
— so the count had to be guessed from how much orange was on screen. Two further problems came
out while fixing it.

**The legend only accounted for half the map under a filter.** With a filter active the map draws
four things: one colour per answer, grey for a household that did not answer, and grey for a
structure nobody is registered on. Only the first two had legend rows. On *Site No 102* that left
**959 of 1786 structures** drawn in a colour the legend never mentioned.

**The legend crowded the map out.** It is a wrapping chip list capped at 140px with its own
scroll; under a filter with several answers it fills that cap, and on a 2340px phone screen the
map loses a sixth of its height to it permanently.

## What the fix does

**A count on every category.** `statusCounts()` and `answerCounts()` in `mapData.js` walk the
structures **on the map** — not `statusMap`, which also holds households no structure covers, and
would otherwise inflate every number. The legend builders in `colorCoding.js` attach the counts;
`selected` and `searchHit` stay uncounted because they are interaction states, not categories.

**Both greys are listed**, so every colour on screen has a row and the counts reconcile:

| Site No 102, *Do you have a toilet at home?* | |
|---|---|
| Yes | 391 |
| No | 159 |
| No data (registered, did not answer) | 277 |
| Not surveyed (nobody registered) | 959 |
| **Total** | **1786 = every structure on the map** |

which agrees with the status view's 959 + 810 + 17, since 391 + 159 + 277 = 827 = 810 registered
plus 17 duplicates.

**A category nothing is drawn in is dropped** rather than printed as `(0)`. A row the worker
cannot act on is a line of legend the map is paying for. Called without counts the builders behave
exactly as before, so nothing else that uses them changed.

**The legend folds to a one-line bar.** `Legend · 4 categories` with a chevron; tapping it gives
the strip back to the map. It is **open by default** — a worker who never touches it sees what
they saw before, now with counts — and the choice persists while filters change, so collapsing
once stays collapsed through a working session.

## Counts are category totals, not "currently shown"

Unticking a row greys its structures but leaves its count alone. Recomputing against what is
visible would make every number move whenever a row is ticked, and the question the count answers
— how many houses are in this category — does not change because the worker hid them.

## Cost

Counting walks every structure, and `render()` must not. `legendRows()` is memoised on the filter,
the answer map, the status map and the slum file, the same pattern `extrasNotOnMap()` and
`structureNumbers()` already use — so the walk happens once per real change, not once per frame.

## Size

The strip is **not** allowed to grow. The bar is 28px and the scroll's cap went 140 → 112, so an
open legend occupies the same 140px it always did, still scrolling inside; collapsed it is 28px.

## Files touched

```
 src/gis/colorCoding.js       | 25 ++++--
 src/gis/mapData.js           | 26 +++++++
 src/views/MapPickerScreen.js | 91 +++++++++++-------
 test/gis/colorCodingTest.js  | 26 +++++++
 test/gis/mapDataTest.js      | 36 +++++++++
 5 files changed, 168 insertions(+), 36 deletions(-)
```

## Verification

**Unit — 2136 passing**, 9 of them new: counts over structures on the map only, households off the
map excluded, an empty map, both greys counted, zero-count categories dropped from either legend,
and interaction rows left uncounted.

**On device** — emulator against *Site No 102* (1786 real structures): the status legend read
959 / 810 / 17; the toilet filter read 391 / 159 / 277 / 959; collapsing returned the full slum to
view; the collapsed choice survived a filter change; and unticking `Yes (391)` greyed those houses
while keeping the count.
