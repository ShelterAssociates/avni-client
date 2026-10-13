# Upstream merge log

One entry per merge of `avniproject/avni-client` into `shelter-master`. Append a new entry at the
top each time. For *how* to do a merge, see [`UPSTREAM_MERGE_GUIDE.md`](UPSTREAM_MERGE_GUIDE.md);
for *where conflicts will land*, see [`FILE_INVENTORY.md`](FILE_INVENTORY.md).

---

## 2026-10-13 — upstream `3056a2145` (18.1)

| | |
|---|---|
| Merge commit | `16899f61a` |
| Our base before | `f299d8a8f` (26 commits, 2026-09-18 base) |
| Brought in | 135 commits (127 non-merge), 27 issues, 176 files, +27196 / −471 |
| Upstream span | 2026-09-18 → 2026-10-01 |
| Conflicts | 1 file |
| Our footprint after | 61 files, +6110 / −102 (unchanged by the merge) |

### What came in

| Issue | Commits | What |
|---|---|---|
| `#2140` | 23 | SQLite fast sync — tier-aware restore, catchment dumps, peer caseload cleanup shared between Realm and SQLite, SQLite DB uploaded as a fast sync dump. Includes reverts of `ee9265e53`, `12cbb5e42`, `dce92adcc`, `d59e6bce8` |
| `#2120` | 12 | Reopen both databases before Delete Data wipes them; bind a reopened DB when it is already the active backend |
| `#2157` | 9 | Dashboard and Filter — counts recomputed when filtering from a card list, address picker rebuilt on subject-type change, village/block matching on open |
| `#2105` | 9 | Query performance — batch-load lists a shallow query keeps instead of one query per row |
| `#2144` | 8 | Hidden values excluded from shared/printed forms and from visit, profile, enrolment, approval and rule summaries |
| `#2024` | 7 | Custom filter scan runs once per card, not per visit table |
| `#2143` | 6 | A hidden question no longer blocks Next, and is never drawn on a form page or in a repeating block |
| `#2142` | 6 | Migration still reported abandoned on timeout; transient network failures filtered across all reporters |
| `#2135` | 6 | Forced login prompt counted once, and only when the user did not sign out |
| `#2134` | 6 | Session kept when Cognito's reply cannot be read; re-login on unknown auth codes |
| `#2141` | 5 | Sync-finished flag cleared on start and set on finish; catchment upload blocked on an unfinished sync |
| `#2167` | 4 | **16 KB page alignment** — `op-sqlite` pinned to 15.2.14; release build now *fails* on a misaligned 64-bit native library |
| `#2166` | 2 | Gallery button on guided photo questions unless gallery upload is off |
| `#2014` | 2 | Lockfiles excluded from the local size guard |

Smaller: `#2162` placeholder address on SQLite reads, `#2160` drafts deleted on the active backend,
`#2052` raw translation keys and `en.json` copy fixes, plus `#2139` `#2138` `#2137` `#2115` `#2102`
`#2075` `#2062` `#2000` `#1977` `#1770`.

### Dependency changes

| Package | From | To | Why |
|---|---|---|---|
| `openchs-models` | 1.33.84 | 1.33.86 | adds `isHidden()` (`#2143`) |
| `@op-engineering/op-sqlite` | `^11.3.0` | `15.2.14` (exact) | 16 KB-aligned native libs (`#2167`) |

### The one conflict

`packages/openchs-android/src/views/SyncComponent.js` — adjacent import lines, not a logic clash.
Ours added `GisSyncService` and `AddressLevelService`; upstream added `logForcedLoginPrompt`
(`#2135`) and `syncFailureReason` (`#2142`) on the same lines.

**Resolved by keeping all four imports.** Each of the four was confirmed to have a real call site in
the merged file.

Eleven further files overlapped and auto-merged cleanly: `Makefile`, `package.json`,
`package-lock.json`, `LoginView.js`, `MenuView.js`, and all six `translations/*.json`.

### Verification

- GIS suite: **13 suites, 91 tests, all pass**
- Our footprint against the new base is unchanged from the old base — 61 files, +6110 / −102 — so
  nothing of ours was dropped and nothing of upstream's reverted. Zero files deleted by the merge.
- Full suite reports ~30 failed suites / 219 failed tests. **Pristine upstream master fails
  identically (219)** in this environment, so the merge introduced no new failures.

### Still unverified

`#2140` changed how data is stored and restored. `GisSyncService` and `mapData.js` read
registrations from the database, and the GIS tests do not exercise the SQLite backend. **The map
needs a manual check on a device.**

Pre-merge state preserved at `backup/shelter-master-pre-merge` (`f299d8a8f`).
