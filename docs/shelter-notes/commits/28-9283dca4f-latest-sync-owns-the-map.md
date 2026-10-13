# 28. gis: the newest sync owns the map, and a slum with no structures offers the extra-household flow

| | |
|---|---|
| Commit | `9283dca4f149a729b24920df6b8bf613d4e2d24a` |
| Short | `9283dca4f` |
| Date | 2026-10-14 |
| Phase | Phase 8 - the slum file follows the server |

## Why this exists

Shelter re-digitises slums. A structure is rarely deleted outright: it is moved, its number is
corrected, the whole layer is re-uploaded when a slum is surveyed again. The map therefore has one
job — show whatever the latest sync returned — and it was not doing it. An updated KML did not
replace the saved copy, and a structure removed on the website stayed on the phone's map
indefinitely, where a worker could still tap it and fill a household onto a building that no
longer exists.

The fault was entirely on the client. `component/avni_map.py` hard-deletes components and rebuilds
`features` from a live query on every request, so the response has always been a correct current
snapshot; deletion is signalled by omission. Nothing on the server needed to change.

## What was actually wrong

`GisSyncService.downloadStructuresForSlum` had **three exits that all mean "keep the stale file"**,
all of them logged at warn level and otherwise silent:

| Exit | Trigger |
|---|---|
| `!response.ok` | server or network failure |
| `!keepsMoreMapData(previous, next)` | the staleness guard refused the response |
| `catch (e)` | anything thrown between the fetch and the write |

The guard was the root of it, in two separate ways.

**It paid for itself in memory.** To decide whether to overwrite the saved file it *parsed* the
saved file:

```js
const text = await response.text();                 // ~5 MB for a 9k-polygon slum
const next = JSON.parse(text);                      // tens of MB of JS objects
const previous = (await RNFS.exists(destPath))
    ? JSON.parse(await RNFS.readFile(destPath, 'utf8')) : null;   // ...and the same again
```

Two fully parsed slums alive at once, on the phones this build targets. Anything that throws in
that window — an out-of-memory above all — lands in the `catch`, becomes one `logWarn`, and leaves
the old file in place forever. Nothing surfaces to the worker beyond "1 could not be downloaded".

**And it refused shrinking responses by design** (added in `0c4522c7d`, "sync keeps a good slum
file when the server answers with less"). That guard was written against a server that
occasionally answered with nothing mid-upload, and it does stop that. But it also means a slum
whose structures were all removed could never be corrected on the phone.

A single deletion did pass the guard, which is why this could not be pinned from reading alone;
the per-slum log line distinguishes the three exits and was used to confirm it on a device.

## What the fix does

**The newest successful download always wins.** The guard is gone, replaced by backup-then-commit:

1. rename the saved file to `<name>.bak`
2. write the new one
3. drop the `.bak` on success, restore it if the write throws
4. recover a `.bak` left behind by a sync that was killed mid-write, on the next run

A rename is free where a copy of 5 MB is not, and the previous file is never parsed again. The
only payload refused is one that is **not a slum file at all** — `isStructureCollection()` checks
for a `FeatureCollection` with a `features` array, so a proxy error page or a JSON `{"error": …}`
cannot replace good structures, while a shrunken, renumbered or entirely empty one always lands.

**A slum with no structures gets a screen instead of a dead end.** Once deletions propagate, "no
structures in this slum" becomes a legitimate state. It used to be an `alert()` that bounced the
worker out. `src/views/gis/NoStructures.js` now stands in for the map: the **Register extra
household** button on top, the slum's recent registrations below it, tappable. It also covers the
"nothing synced yet" case, which had the same dead-end alert.

**"Missing" stays derived, never stored.** Nothing retains deleted geometry. A structure that is
gone is simply absent from the file, so `extraHouseholds()` — unchanged, from `e1dba0e83` — picks
up the household stranded on it automatically, and a structure that is re-added later needs no
cleanup at all.

## What the commit says

```
A structure is rarely deleted outright - it is moved, renumbered, redrawn when a slum
is re-digitised - so the map must simply show whatever the latest sync returned.
It did not. [...]

- replace the dead-end "Structure not found on map" alert with an offer to register
  that number as an extra house; a number the latest sync dropped can only be one
- count the households no structure covers on the extras button, so the map says how
  much of the slum it cannot show
- reload the slum file on focus when sync has rewritten it, instead of drawing the
  structures the screen was opened with
- read mtime through a helper that cannot throw: sync renames the file out from under
  the map while it writes
```

## Files touched

```
 src/gis/gisFile.js             |  14 +-
 src/gis/householdSummary.js    |  15 ++
 src/service/GisSyncService.js  |  55 +++++---
 src/views/MapPickerScreen.js   | 152 ++++++++++++++------
 src/views/gis/NoStructures.js  |  50 +++++++   (new)
 test/gis/extraHouseholdsTest.js|   4 +
 test/gis/gisFileTest.js        |  30 ++--
 test/gis/householdSummaryTest.js |  23 +++-
 test/service/GisSyncServiceTest.js | 146 ++++++++++++   (new)
 9 files changed, 414 insertions(+), 75 deletions(-)
```

`keepsMoreMapData()` was deleted; `gisFile.js` now holds `isStructureCollection()` and
`slumFileName()`. `MapPickerScreen` no longer defines its own `GIS_DIR` — the path comes from
`GisSyncService.slumFilePath()`, so the file sync writes and the file the map reads can no longer
drift apart.

## Verification

**Unit — 103 tests across 14 GIS suites, all passing.** `test/service/GisSyncServiceTest.js` is
new and runs against a **real filesystem** (an `RNFS` mock backed by `node:fs` in a temp
directory), because the behaviour under test is what survives on disk:

| Case | Expectation |
|---|---|
| first sync | file written, no `.bak` |
| deleted / renumbered / moved | saved file replaced |
| zero structures left | saved file replaced |
| response is not a slum file | saved file kept |
| HTTP failure | saved file kept |
| write throws | saved file restored, no `.bak` |
| `.bak` left by a killed sync | recovered |
| stale `.bak` beside a good file | dropped |

**On device — emulator (API 35) against a local `shelter_local`,** using the test account's slum
*Site No 102*, which has no Structure layer of its own:

| Step | Result |
|---|---|
| 0 structures | the new screen, with the slum's recent registrations |
| 8 structures added on the website, sync | all 8 drawn on the map |
| delete 3, renumber `103`→`103A`, move `102`, sync | 3 gone, `103A` drawn as not-surveyed, `102` in its new position |
| stored file afterwards | 22902 bytes, `101 102 103A 105 106` — byte-identical to the server's response, no `.bak` left |
| search a deleted number | *"#104 is not on the map … Register it as an extra house?"* |

Test data was removed afterwards: slum 755 back to 13 Structure components, slum 1983 back to 0.

## Still unverified

- **Release build.** Only the debug build was exercised.
- **Offline sync.** The emulator was online throughout. The path is unchanged — Avni sync fails
  first and `syncGisData` is never reached — but it was not demonstrated.
