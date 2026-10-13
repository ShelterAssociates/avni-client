# 27. Merge upstream/master (18.1, `3056a2145`) into shelter-master

| | |
|---|---|
| Commit | `16899f61ab183017e063d0c01aa6ea410d361c23` |
| Short | `16899f61a` |
| Date | 2026-10-13 |
| Type | **Merge commit** — parents `f299d8a8f` (ours) and `3056a2145` (upstream) |
| Phase | Phase 7 - upstream catch-up |

This is the first upstream merge since the fork was re-based on `9f7bda055` on 2026-09-18. A
condensed version of this record lives in [`../UPSTREAM_MERGES.md`](../UPSTREAM_MERGES.md); this
file is the detailed per-commit entry.

## Why this exists

Shelter's 26 commits sat on Avni master as of 2026-09-18. By 2026-10-01 upstream had moved 135
commits ahead, so the fork was three weeks stale and drifting further. Two of those upstream
changes made catching up urgent rather than optional:

- **`#2167` 16 KB page alignment.** Upstream pinned `op-sqlite` to exactly 15.2.14 so its native
  libraries are 16 KB-aligned, and made the release build *fail* when a 64-bit native library is
  not. Shelter builds release APKs, so staying behind this meant shipping on a toolchain upstream
  had already declared broken.
- **`#2140` SQLite fast sync.** Avni is migrating storage from Realm to SQLite. The longer the
  fork waits, the more of that migration it has to absorb at once — and Shelter's GIS code reads
  registrations straight out of the database.

A merge was chosen over a rebase: a rebase would replay 26 commits and re-ask the same conflicts
once per commit, and would need a force-push to a branch shared through the org fork. The merge
resolves everything once and preserves both histories.

## Measurements

Three different diffs get confused here, so all three are recorded:

| Measurement | Result |
|---|---|
| Upstream's own change over the span (`9f7bda055` → `3056a2145`) | 176 files, +27196 / −471 |
| Net effect on our branch (`f299d8a8f` → this merge) | 176 files, +27196 / −471 |
| Our footprint after merging (`3056a2145` → this merge) | 61 files, +6110 / −102 |

The first two being **identical** is the proof that the merge brought in exactly upstream's change
and nothing else. The third is unchanged from before the merge, which is the proof that none of
Shelter's work was dropped.

> Do not use `git diff f299d8a8f 3056a2145` (225 files, +27385 / −6668) to describe this merge. That
> compares two tips and so also counts the removal of Shelter's own 61 files, inflating the
> deletions roughly thirteenfold.

## What came in

135 commits, 127 of them non-merge, across 27 issues, spanning 2026-09-18 to 2026-10-01.

| Issue | Commits | What |
|---|---|---|
| `#2140` | 23 | SQLite fast sync — tier-aware restore, catchment dumps, peer caseload cleanup shared between Realm and SQLite, SQLite DB uploaded as a fast sync dump. Includes reverts of `ee9265e53`, `12cbb5e42`, `dce92adcc`, `d59e6bce8` |
| `#2120` | 12 | Reopen both databases before Delete Data wipes them; bind a reopened DB when it is already the active backend; reopen Realm before falling back to it |
| `#2157` | 9 | Dashboard and Filter — counts recomputed when filtering from a card list, address picker rebuilt on subject-type change, village/block matching on open, location filter dropped on subject-type change |
| `#2105` | 9 | Query performance — batch-load the lists a shallow query keeps instead of one query per row; stop re-fetching subjects a preload already has |
| `#2144` | 8 | Hidden values excluded from shared and printed forms, and from visit, profile, enrolment, approval and rule summaries. One place now decides which recorded values may be drawn |
| `#2024` | 7 | Custom filter scan runs once per card, not per visit table; joins reused when projecting a property path |
| `#2143` | 6 | A hidden question no longer blocks Next, and is never drawn on a form page or inside a repeating block |
| `#2142` | 6 | Migration still reported abandoned on timeout; transient network failures filtered across all reporters, not only the sync screen |
| `#2135` | 6 | Forced login prompt counted once, and only when the user did not sign out |
| `#2134` | 6 | Session kept when Cognito's reply cannot be read; re-login on unknown auth codes |
| `#2141` | 5 | Sync-finished flag cleared on start and set on finish; catchment upload blocked on an unfinished sync or pending reset |
| `#2167` | 4 | 16 KB page alignment — `op-sqlite` pinned to 15.2.14; release build fails on a misaligned 64-bit native library |
| `#2166` | 2 | Gallery button shown on guided photo questions unless gallery upload is turned off |
| `#2139` `#2138` `#2062` `#2014` | 2 each | Lockfiles excluded from the local size guard; no-primary-key write guarantees corrected |
| `#2162` `#2160` `#2137` `#2115` `#2102` `#2075` `#2052` `#2000` `#1977` `#1770` | 1 each | Placeholder address on SQLite reads; drafts deleted on the active backend; raw translation keys and `en.json` copy fixes |

### Largest incoming files

```
drizzle-migrations/meta/0008_snapshot.json                       +8456
drizzle-migrations/meta/0007_snapshot.json                       +8446
docs/superpowers/plans/2026-09-24-sqlite-fast-sync-upload-server.md +645
test/service/BackupRestoreSqliteServiceTest.js                    +623  -4
docs/superpowers/plans/2026-09-25-sqlite-fast-sync-upload-client.md +590
docs/superpowers/specs/2026-09-24-sqlite-fast-sync-upload-design.md +344
test/model/CaptureGuidanceTest.js                                 +290
test/views/forms/FormElementGroupHiddenQuestionTest.js            +277
src/service/BackupRestoreSqliteService.js                         +222  -23
src/views/form/formElement/MediaFormElement.js                    +188  -18
```

The two drizzle snapshots are generated SQLite schema metadata and account for 62% of all
insertions on their own.

## Dependency changes

| Package | From | To | Why |
|---|---|---|---|
| `openchs-models` | 1.33.84 | 1.33.86 | adds `isHidden()`, required by `#2143` |
| `@op-engineering/op-sqlite` | `^11.3.0` | `15.2.14` (exact, caret dropped) | 16 KB-aligned native libraries, `#2167` |

After this merge `node_modules` must be refreshed, or roughly 30 suites fail with
`isHidden is not a function`:

```sh
cd packages/openchs-android && yarn install && npx patch-package
```

Do **not** pass `--ignore-scripts`. This repo's `postinstall` runs `patch-package && npx jetify`,
and skipping it leaves the tree broken in a way that looks like a merge defect.

## Conflicts

**One file: `packages/openchs-android/src/views/SyncComponent.js`.**

Adjacent import lines, not a logic clash. Both sides appended imports to the same place at the end
of the import block:

```js
<<<<<<< HEAD
import GisSyncService from "../service/GisSyncService";              // Shelter
import AddressLevelService from "../service/AddressLevelService";    // Shelter
=======
import {logForcedLoginPrompt} from "../utility/ForcedLoginPrompt";   // upstream #2135
import {syncFailureReason} from "../framework/errorHandling/SyncFailureReason";  // upstream #2142
>>>>>>> upstream/master
```

**Resolved by keeping all four imports**, Shelter's first. Before resolving, each of the four
symbols was confirmed to have a real call site in the merged file, so none is a dead import left
over from the conflict.

### Files that overlapped but auto-merged

Eleven further files were touched by both sides and merged without intervention. They are the ones
to watch on the next merge:

```
Makefile
packages/openchs-android/package.json
packages/openchs-android/package-lock.json
packages/openchs-android/src/views/LoginView.js
packages/openchs-android/src/views/MenuView.js
packages/openchs-android/translations/en.json
packages/openchs-android/translations/gu_IN.json
packages/openchs-android/translations/hi_IN.json
packages/openchs-android/translations/ka_IN.json
packages/openchs-android/translations/mr_IN.json
packages/openchs-android/translations/ta_IN.json
```

## Verification performed

| Check | Result |
|---|---|
| GIS test suite | 13 suites, **91 tests, all pass** |
| Our footprint vs new base | 61 files, +6110 / −102 — **identical** to before the merge |
| Files deleted by the merge | **zero** (`git diff --diff-filter=D backup/shelter-master-pre-merge shelter-master` is empty) |
| Tracked file count | 1250 → 1314, purely additions |
| GIS source files on disk | 14 in `src/gis/`, 13 in `test/gis/` — unchanged |
| Shelter logo assets | both PNGs present; `BrandLogos` still wired into `LoginView`, `AppHeader`, `UnhandledErrorView` |
| GIS translation keys | `slumMap`, `openingMap`, `mapWhatAreYouFilling` present exactly once in all 6 languages |
| Makefile GIS config | `GIS_SERVER_URL` and `GIS_API_KEY` intact |

### The full-suite failure baseline

The full suite reports roughly **30 failed suites / 219 failed tests** after this merge. That is
**not** a regression. Pristine upstream `master`, same machine and same `node_modules`, fails
identically:

| Branch | Suites failed | Tests failed | Tests passed | Total |
|---|---|---|---|---|
| upstream `master` (pristine) | 30 | 219 | 2029 | 2250 |
| `shelter-master` (this merge) | 30 | 219 | 2120 | 2341 |

Same failures; our branch simply has 91 more passing tests, which are exactly the GIS suite. The
failures are pre-existing in Avni's own master in this environment — mostly SQLite and Realm
roundtrip tests that need native bits plain Node does not provide. **Always compare against this
baseline before blaming a merge.**

## Still unverified

`#2140` changed how data is stored and restored, and `GisSyncService` and `mapData.js` read
registrations from the database. The GIS tests are pure-function tests and do not exercise the
SQLite backend, so **the map must be checked on a real device** before this goes to field staff.
A green GIS suite does not cover this.

## Recovery

Pre-merge state is preserved at `backup/shelter-master-pre-merge` (`f299d8a8f`):

```sh
git reset --hard backup/shelter-master-pre-merge
```
