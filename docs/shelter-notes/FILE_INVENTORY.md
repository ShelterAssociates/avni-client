# Shelter Associates — file inventory vs Avni upstream

What this fork changes, and where future upstream merges will hurt.

- **Fork:** `ShelterAssociates/avni-client`
- **Our branch:** `shelter-master` — all Shelter work lives here
- **Mirror branch:** `master` — always byte-identical to `avniproject/avni-client`, never receives our commits
- **Last upstream merge:** 2026-10-13, merged `upstream/master` @ `3056a2145` (135 commits, Sep 18 → Oct 1)

## Totals

| Metric | Count |
|---|---|
| Tracked files in repo | 1352 |
| Files we added | 36 |
| Avni files we modified | 27 |
| Avni files we deleted | 0 |
| **Our total footprint** | **63 files, +6581 / −102** |

We delete nothing of Avni's and add far more than we change — the work is overwhelmingly additive, which is why merges have stayed cheap so far.

The footprint counts **code only**. These fork notes are a further 36 files (+2607) under `docs/shelter-notes/`; upstream has nothing at those paths, so they cannot conflict and are left out of the conflict-surface arithmetic. Measured at `9cfb0f517` (2026-10-14).

## Regenerating this document

Every number here comes from these commands. Re-run them after each upstream merge.

```sh
git fetch upstream
git ls-files | wc -l                                                  # total tracked
git diff --shortstat upstream/master...shelter-master                 # our footprint
git diff --numstat --diff-filter=A upstream/master...shelter-master    # added
git diff --numstat --diff-filter=M upstream/master...shelter-master    # modified

# conflict risk: how often upstream churns each file we touch
for f in $(git diff --diff-filter=M --name-only upstream/master...shelter-master); do
  printf "%-62s %s\n" "$f" "$(git log --oneline --since='12 months ago' upstream/master -- "$f" | wc -l)"
done | sort -k2 -rn
```

---

## 1. Files we added (36)

Upstream has no file at these paths, so **these can never conflict.** Safe by construction.

### GIS core — `src/gis/` (14 files, 833 lines)

| File | Lines |
|---|---|
| `src/gis/mapData.js` | 189 |
| `src/gis/GisMappingQueue.js` | 106 |
| `src/gis/observationAnswers.js` | 93 |
| `src/gis/colorCoding.js` | 100 |
| `src/gis/mapBrowser.js` | 80 |
| `src/gis/GisConfig.js` | 49 |
| `src/gis/mapRegistrationForms.js` | 44 |
| `src/gis/structureNumber.js` | 41 |
| `src/gis/mapCenter.js` | 25 |
| `src/gis/extraHouseholds.js` | 24 |
| `src/gis/householdSummary.js` | 34 |
| `src/gis/filterColors.js` | 16 |
| `src/gis/mapEntry.js` | 9 |
| `src/gis/gisFile.js` | 11 |

### Views and services (5 files, 1492 lines)

| File | Lines | Purpose |
|---|---|---|
| `src/views/MapPickerScreen.js` | 1279 | the map screen itself |
| `src/service/GisSyncService.js` | 114 | pulls GIS data on sync; the newest download replaces the slum file |
| `src/views/gis/MapChoices.js` | 54 | "what are you filling?" chooser |
| `src/views/gis/NoStructures.js` | 50 | stands in for the map when a sync brings no structures |
| `src/views/common/BrandLogos.js` | 15 | Avni × Shelter logo pair |

### Tests — `test/gis/` + `test/service/` (14 files, 954 lines)

`GisConfigTest` · `GisMappingQueueTest` · `colorCodingTest` · `extraHouseholdsTest` · `filterColorsTest` · `gisFileTest` · `householdSummaryTest` · `mapCenterTest` · `mapDataTest` · `mapEntryTest` · `mapRegistrationFormsTest` · `observationAnswersTest` · `structureNumberTest` · `GisSyncServiceTest` (in `test/service/`)

**112 tests, all passing** as of `9cfb0f517` (2026-10-14). `GisSyncServiceTest` is the only one
that is not a pure-function test: it mocks `react-native-fs` onto a real temp directory, because
what it checks is which file survives a failed or interrupted download.

### Assets and config (3 files)

| File | Notes |
|---|---|
| `android/app/src/generic/assets/shelter-logo.png` | binary, 43 KB |
| `android/app/src/generic/assets/shelter-logo-dark.png` | binary, 10 KB |
| `android/app/src/main/res/xml/network_security_config.xml` | 9 lines, allows cleartext to the GIS server |

---

## 2. Avni files we modified (27) — the conflict surface

**Only these 27 files can ever conflict.** Ranked by risk = how often upstream churns the file × how deeply we cut into it.

### 🔴 High risk — expect a conflict on most merges

| File | Our change | Upstream commits/yr | Why it hurts |
|---|---|---|---|
| `packages/openchs-android/package-lock.json` | +2995 / −1 | 75 | Huge generated file. Conflicts constantly, but never resolve by hand — regenerate it |
| `packages/openchs-android/package.json` | +2 / −0 | 86 | Avni's most-churned file (version bumps). Our 2 lines are the Leaflet dep |
| `translations/en.json` | +3 / −0 | 51 | We add 3 GIS keys; Avni adds its own constantly |
| `src/views/RegisterView.js` | **+39 / −78** | 4 | **Low churn but highest semantic risk** — the only place we removed substantial Avni logic. If upstream ever reworks this region, the merge will need real thought, not a mechanical fix |

### 🟡 Medium risk — conflicts likely, resolve mechanically

| File | Our change | Upstream commits/yr | Resolution |
|---|---|---|---|
| `translations/mr_IN.json` | +3 / −0 | 36 | keep both key sets |
| `translations/hi_IN.json` | +3 / −0 | 36 | keep both key sets |
| `translations/ta_IN.json` | +3 / −0 | 34 | keep both key sets |
| `translations/ka_IN.json` | +3 / −0 | 34 | keep both key sets |
| `translations/gu_IN.json` | +3 / −0 | 34 | keep both key sets |
| `src/views/SyncComponent.js` | +5 / −0 | 23 | **conflicted in the Oct 2026 merge** (adjacent imports) — keep both sides |
| `src/service/AllServices.js` | +1 / −0 | 21 | one registration line for `GisSyncService` |
| `Makefile` | +12 / −2 | 20 | our `GIS_SERVER_URL` / `GIS_API_KEY` block |
| `android/app/build.gradle` | +8 / −0 | 16 | asset/packaging config |
| `src/views/LandingView.js` | +17 / −0 | 14 | floating map button + `MapChoices` |
| `src/views/MenuView.js` | +7 / −1 | 13 | menu entry for the map |

### 🟢 Low risk — rarely or never conflicts

| File | Our change | Upstream commits/yr |
|---|---|---|
| `src/utility/CHSNavigator.js` | +40 / −1 | 9 |
| `src/views/LoginView.js` | +3 / −3 | 8 |
| `src/action/subject/SubjectRegisterActions.js` | +19 / −1 | 8 |
| `src/App.js` | +3 / −3 | 5 |
| `.gitignore` | +2 / −0 | 5 |
| `src/views/subject/SubjectRegisterView.js` | +1 / −0 | 4 |
| `src/views/common/AppHeader.js` | +14 / −6 | 2 |
| `src/state/SubjectRegistrationState.js` | +1 / −0 | 2 |
| `android/app/src/main/AndroidManifest.xml` | +1 / −0 | 2 |
| `src/views/index.js` | +2 / −1 | 0 |
| `src/ServerUrlConfiguration.js` | +3 / −2 | 0 |
| `src/framework/errorHandling/UnhandledErrorView.js` | +3 / −3 | 0 |

---

## 3. Functionality that must survive every merge

Check these after any upstream merge.

### Slum map (GIS)

| Integration point | File |
|---|---|
| Floating map button on home | `src/views/LandingView.js` |
| Menu entry | `src/views/MenuView.js` |
| Navigation to the map | `src/utility/CHSNavigator.js` |
| Registration autofill from a map pin | `src/views/RegisterView.js`, `SubjectRegisterActions.js` |
| Sync pulls GIS data | `src/service/GisSyncService.js` via `AllServices.js` |
| Server URL + API key | `Makefile`, `src/gis/GisConfig.js` |

### Shelter branding

| Where | File |
|---|---|
| Logo pair component | `src/views/common/BrandLogos.js` |
| Login screen | `src/views/LoginView.js` |
| App header (small mark) | `src/views/common/AppHeader.js` |
| Error screen | `src/framework/errorHandling/UnhandledErrorView.js` |

`LandingView` carries **no** logo by design — only the map button.

### Verification

```sh
cd packages/openchs-android && npx jest test/gis    # expect 13 suites, 91 tests, all pass
```

---

## 4. Merge procedure

```sh
git fetch upstream
git checkout master && git pull                 # keep the mirror current
git checkout shelter-master
git merge upstream/master                       # merge, don't rebase — resolve once, no force-push
# resolve conflicts, then:
cd packages/openchs-android && npx jest test/gis
git push
```

**Merge, not rebase.** A rebase would replay 26+ commits and re-ask the same conflicts repeatedly, and would need a force-push to a shared branch.

### Known test-suite baseline

The full suite reports **~30 failed suites / 219 failed tests** — these fail identically on pristine Avni `master` in this environment (SQLite/Realm roundtrip tests needing native bits). Compare against the baseline before blaming a merge:

```sh
git checkout master && npx jest   # baseline
git checkout shelter-master && npx jest
```

Our branch should show the same failure count plus 91 extra passing tests.

### After-merge dependency gotcha

If tests fail with "X is not a function" on an Avni model, `node_modules` is stale against the merged `package.json`:

```sh
cd packages/openchs-android && yarn install && npx patch-package
```

Do **not** pass `--ignore-scripts` — this repo's `postinstall` runs `patch-package`, and skipping it breaks ~30 suites.

### Open risk

Upstream's `#2140` SQLite migration changed how data is stored and restored. `GisSyncService` and `mapData.js` read registrations from the database, and the GIS tests do not exercise the SQLite backend. **Verify the map populates on a real device** after any merge that touches storage.
