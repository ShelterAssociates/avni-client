# Avni GIS Integration — Phase 1 Codebase Audit

**Date:** 2026-09-18
**Scope:** `avni-client` fork at `/home/shelter/avni/avni-client` (HEAD `5c8395d`, 31 Mar 2026) and the Shelter Associates Django GIS server, audited against `avni_spatial_map_integration.pdf` (29 pp, March 2026 — the technical white paper; the two other PDFs in this folder are the non-technical business case and contain no code) and against upstream `avniproject/avni-client` master.
**Method:** every claim below was checked against the real files, real git history, a blobless clone of upstream, and (for auth) a live request to the production Avni server. Line numbers refer to the fork at `5c8395d`.

**Headline findings (read these first)**

1. **The Django GIS server code is not in any repository.** `get_structures_for_avni`, `map_subject_to_structure`, `AVNI_UUID_TO_SLUM_ID` and their URL routes only survive in VS Code's local-history cache. The project folder they lived in (`~/Desktop/Shelter_New/`) has been deleted except for root-owned `media/` and `static/`. See §1.1 (Django rows) — this must be restored before Phase 2 can touch the server.
2. **Production auth is Cognito, not Keycloak.** `GET https://server.avniproject.org/idp-details` returns `idpType: "cognito"`; the Keycloak block is empty. Phase 5's "login form → Keycloak" assumption is wrong for this instance (§1.2.5).
3. **Two regressions and shipped debug code in the fork.** `CHSNavigator.goBack(source)` was accidentally replaced, so Add-Member / Remove-Member / Add-Relative flows now throw; 8+ `alert()` popups (including "sync pressed" on every Sync tap and "onSave structureId=…" on every household save) reach field workers (§1.3.10).
4. **The fork has no git ancestry with upstream** (unzipped from `avni-client-master`); true base is upstream `bb1d4c52` (25 Mar 2026). Upstream master is 685 commits / 13 releases ahead. A trial rebase was performed: it is *painful but mechanical* — details in §1.2.3.
5. **Upstream has since added the native half of deep-linking** (HTTPS App Links, #1899) but no JS URL handler; the "custom card actions" feature is internal-only. Phase 4 should be a small JS handler on top of #1899 (§1.2.4).
6. **The 3-concept filter list is still hardcoded** in the UI (`FILTER_CONCEPTS`, `MapPickerScreen.js:15`). Phase 3 scope is confirmed as written (§1.3.8).

---

## 1.1 Drift from the white paper (Section 11 file table)

| File (white paper §11) | Exists? | Matches documented behaviour? | Divergence / notes |
|---|---|---|---|
| `src/service/GisSyncService.js` (NEW) | Yes (65 lines) | Mostly | `GIS_SERVER = 'http://localhost:8000'` (L4), **not** `192.168.1.7:8000` as documented. `loadStructures()` documented in §5.1 is commented out (L47–54); MapPickerScreen reads RNFS directly instead. Top-level `catch` shows `alert('GIS ERROR: …')` (L21) — not in the doc. `hasLocalData()`/`clearAll()` exist but are unused. Non-OK HTTP is logged and skipped (L32–35), which is better than the doc's "errors propagate to UI". |
| `src/views/MapPickerScreen.js` (NEW) | Yes (761 lines) | Mostly | Palette has **12** colours (L28–32), doc says 10. Concept names differ from doc §10.3: actual `'Do you have a toilet at home?'`, `'Are you interested in an individual toilet ?'` (L15–19). `FILTER_LABELS` display map (L21–26) undocumented. Coded-answer detection uses UUID-shape heuristic (L95–96) as documented. Leaflet loaded from `unpkg.com` (L296–297), tiles from `mt1.google.com` (L318) — both need internet; doc's "offline" claim applies to polygons only. `handleConfirm()` goes back then fires the callback on a **300 ms `setTimeout`** (L241–248) — undocumented timing dependency. Uses `@turf/turf` for a single `bbox()` call (L4, L224). |
| `src/views/SyncComponent.js` | Yes | **No** | Beyond the documented import + `await GisSyncService.syncGisData(...)` (L28, L205–206): `console.warn('=== SyncComponent.js LOADED ===')` at module top (L1), `console.warn` + **`alert('sync pressed')`** in `sync()` (L159–160), and upstream's offline branch `this._onError(new Error('internetConnectionError'), true)` replaced by **`alert('NOT CONNECTED')`** (L212). `syncService.sync(...)` changed to `await` (needed so GIS runs after sync; upstream has since made the same change). Two upstream debug logs and a comment deleted. Whole file reformatted. |
| `src/views/RegisterView.js` | Yes | Yes | `_navigateViaMap()` (L107–130) and the three action methods match §7.2. Note `[...allLevels].find(a => a.type === 'Slum' && !a.voided)` picks the **first Slum in the entire address hierarchy on the device**, not the user's catchment — see §1.3.12. Whole file reformatted (Prettier `{ a }` spacing). |
| `src/utility/CHSNavigator.js` | Yes | **No** | `navigateToMapPicker()` (L625) and `invokeMapPickerCallback()` (L634) match §7.3, **but** `getPendingStructureId()` does not exist and `_pendingStructureId` is assigned (L635) without ever being declared — only `let _mapPickerCallback` exists (L49). It works only because `@react-native/babel-preset` disables strict mode, making it an implicit global. **Regression:** `static goBack(source)` was replaced by a stray instance method `goBack()` (L137–141) that references `this` and `require('../utility/CHSNavigator')` — clearly a mis-paste of MapPickerScreen code. `CHSNavigator.goBack(this)` is still called by `IndividualAddRelativeView.js:44`, `AddNewMemberView.js:69`, `RemoveMemberView.js:42` → "CHSNavigator.goBack is not a function". `navigateToRegisterView` gained `structureId` (L176, L188) as per §8 step 1. Whole file reformatted. |
| `src/views/subject/SubjectRegisterView.js` | Yes | Yes | `structureId: params.structureId` added to the ON_LOAD dispatch (L105). Whole file reformatted (~100 lines of JSX indentation churn). |
| `src/action/subject/SubjectRegisterActions.js` | Yes | **Partly** | `onLoad` pre-fill (L42–44) and `finalState.structureId` (L81) match §8. `onSave` (L148–161) has the documented POST **plus** `alert('onSave structureId=…')` (L149), `alert('Sending to GIS: …')` (L153), and `.catch(e => alert('GIS mapping failed…'))` (L161) instead of the documented `.catch(e => {})`. The GIS URL is a second, separate literal `http://localhost:8000` (L154). |
| `src/state/SubjectRegistrationState.js` | Yes | Yes | `newState.structureId = this.structureId` in `clone()` (L103). Whole file reformatted. |
| `src/views/index.js` | Yes | Yes | `export * from './MapPickerScreen'` added. |
| `AndroidManifest.xml` | Yes | Yes (reverted) | No Maps meta-data present, matches "later removed". Identical to upstream base. |
| `android/app/build.gradle` | Yes | **No** | Doc says the Maps changes were reverted. Actual diff vs base is `buildFeatures { buildConfig = true }` (L230–232) — undocumented and unrelated to Maps. |
| `android/local.properties` | Yes (gitignored) | Yes | Still contains `GOOGLE_MAPS_API_KEY=AIza…` although react-native-maps was abandoned — the key is now dead and should be deleted from the file and **rotated** in Google Cloud. Never committed (confirmed via `git check-ignore`). |
| **django `component/views.py`** | **NOT IN ANY REPO** | n/a | Only in VS Code history: `~/.config/Code/User/History/60d5b7d7/` (resource `file:///home/shelter/Desktop/Shelter_New/component/views.py`). Last GIS-bearing snapshot `Vvvh.py` (2026-03-30 17:52). The views were **gone from the file by 2026-04-03** (`kGZp.py` onward) — probably the folder was replaced. Last surviving version differs from the paper: mapping is persisted to **`component/subject_structure_map.json` via `load_data()/save_data()`** (not an in-memory dict); `AVNI_UUID_TO_SLUM_ID` has **4** entries (Banthara 1972, Mahadev Nagar 180, Waghar Gholai 1231, Baliram Nagar 1641), not 1; adds `print()` debugging, `slum_id` in the response, proper 400/404 handling. `@csrf_exempt` + `@require_POST` with **no authentication** on the mapping endpoint. |
| **django `component/urls.py`** | **NOT IN ANY REPO** | n/a | VS Code history only; routes `^get_structures_for_avni/$` and `^map_subject_to_structure/$` (last snapshot L20–21). The canonical Django project is `~/Desktop/Shelter_AVNI` (github `vsonje2102/Shelter`, branch `master`) — it has `Component` (`component/models.py:73`) and `Slum` (`master/models.py:128`, `related_query_name='component_slum'`) but **no GIS views or routes**. |

**Undocumented changes found in the fork (not in the §11 table):**
- `package.json`: `@turf/turf ^7.3.4` added (used only for `turf.bbox`).
- `MainApplication.java`: `isNewArchEnabled()` hardcoded to `return false` (New Architecture disabled). Upstream master now sets `IS_NEW_ARCHITECTURE_ENABLED=false` via `buildConfigField` (build.gradle:81), so this override is redundant after the sync.
- `src/task/Sync.js`: whitespace-only reformatting plus a no-op `async` on the post-sync callback.
- `yarn.lock` / `package-lock.json` regenerated (7 000-line churn in commit `210db5d`).

---

## 1.2 Drift from upstream `avniproject/avni-client`

### 1.2.1 Where the fork branched from
- The fork was created from a zip (`avni-client-master`), committed as two snapshot commits (`6b6ca58`, `b09a568`, 30 Mar 2026) with no upstream ancestry and no remote.
- By tree comparison against every upstream commit between 9 Mar and 1 Apr 2026, the **base is upstream `bb1d4c52` (2026-03-25, "Merge branch 'perf/1855' into 16.10")**. Only 8 paths differ between it and the snapshot: gradle wrapper files (`gradlew`, `gradlew.bat`, `gradle/wrapper/*`) and `metadata/android/en-GB/changelogs/.gitkeep` are *missing* from the zip (artefact, not intentional), plus `GisSyncService.js`, `Sync.js`, `SyncComponent.js` — meaning GIS work had already started before the first commit.
- **Upstream master is `9f7bda05` (2026-09-18, "Merge branch '18.0' into master")** — **685 commits** ahead, spanning tags `v16.11.0 … v17.3.0`. `openchs-models` moved 1.33.26 → 1.33.84; `react-native` still 0.77.3; `react-native-webview` 13.16.0 and `react-native-fs` 2.20.0 are still present (MapPickerScreen's deps remain available).

### 1.2.2 Upstream changes to the six-step structureId chain files (base → master)

| File | Upstream commits | What changed upstream | Conflicts with our hook? | Cleaner hook now? |
|---|---|---|---|---|
| `CHSNavigator.js` | 8 (+109/−9) | Added `navigateToMarkAttendance`, `navigateAfterMarkAttendance`, SHARE work-item case, `navigateBackAfterDoVisit`, `onSaveCallback` threading, error-tolerant `moveToNextWorkItem`. `static goBack(source)` (now L169) and `navigateToRegisterView` signature (L206) **unchanged**. | No semantic conflict; textual conflict only at the import block (our `let _mapPickerCallback` sits where upstream added 5 imports). | No new generic hook. |
| `RegisterView.js` | **0** | — | None. | — |
| `SubjectRegisterView.js` | 3 (+6/−5) | `UNSAFE_componentWillMount()` → `loadData()` (deferred load, #2054); `render()` → `renderLoaded()`; `RejectionMessage` removed. | Our one-line `structureId: params.structureId` must move into `loadData()`. With `-Xignore-all-space` git auto-placed it correctly. | Same hook, new method name. |
| `SubjectRegisterActions.js` | 3 (+8/−1) | New imports (`EdgeModelService`, `RuleService`, `dispatchHandleNext`), `onNext` uses `dispatchHandleNext`, 4 new action-map entries. `onLoad`/`onSave` **unchanged**. | None. | — |
| `SubjectRegistrationState.js` | 2 (+6/−2) | `executeRule` became async, `validateEntityAgainstRuleAsync` added. `clone()` **unchanged**. | None. | — |
| `SyncComponent.js` | 11 (+30/−8) | `startSync()` now `await`s `syncService.sync(...)` inside `try/catch/finally` with a `syncSucceeded` flag and an explicit OK button (`SET_SHOW_OK_BUTTON`); offline branch passes `syncStarted=false` (#2097). | **Yes** — our hook must be re-placed under `if (syncSucceeded)`; our `alert('NOT CONNECTED')` collides with the reworked offline branch. | Upstream's `await` is exactly what we needed; hook is now a 3-line addition. |
| `package.json` | 60 | Many dep bumps. | Trivial (one added line). | — |
| `build.gradle` | 14 (+72/−3) | `androidResources.noCompress` for edge models, `testOptions`, App Links placeholders, `IS_NEW_ARCHITECTURE_ENABLED=false`. | Our `buildFeatures{buildConfig=true}` lands in the same region → trivial conflict; also now unnecessary. | — |
| `MainApplication.java`, `views/index.js` | 0 | — | None. | — |

### 1.2.3 Is a rebase trivial, painful, or broken? (from an actual trial rebase in a scratch clone)
Command: `git replace --graft b09a568 bb1d4c52 && git rebase -Xignore-all-space --onto upstream/master bb1d4c52 master`. Result: **4 commits replayed, 2 stops, 5 conflicted paths, no "broken" file.**

| Commit | Stops on | Nature | Verdict |
|---|---|---|---|
| `b09a568` (snapshot) | `SyncComponent.js` | Upstream restructured `startSync()` (see above); our hook + alerts sit inside the changed block. | **Painful** (10 min, needs understanding of `syncSucceeded`). |
|  | `yarn.lock` | add/add | Painful only by size — take upstream, reinstall. |
|  | (silent) gradle wrapper + `.gitkeep` | Replay would *delete* them (zip artefact). | Must be restored by hand — easy to miss. |
| `210db5d` | `build.gradle` | `buildFeatures` vs upstream `androidResources`/`testOptions` in same region. | Trivial. |
|  | `CHSNavigator.js` | Import block vs `let _mapPickerCallback`. | Trivial. |
|  | `yarn.lock` | as above | — |
| `82153d5`, `5c8395d` | — | Applied cleanly. `SubjectRegisterView.js` auto-merged with `structureId` inside `loadData()` (verified). | Trivial. |

Without `-Xignore-all-space`, the whole-file reformatting in 5 files would have conflicted on hundreds of lines. **Decision taken (approved):** rather than rebase, reset to upstream master and re-apply the GIS changes as fresh, minimal commits — see "Sync performed" at the end of this report.

### 1.2.4 "Custom card actions" / deep-link infrastructure upstream
- **Custom card actions exist** (`#1887`, `#1889`, `#1898`): `CustomDashboardActions.onCardPress` resolves a report card's `action` (`DoVisit` / `ViewSubjectProfile`) and `onActionCompletion` (`ReportCard.onActionCompletionTypes.goToSubjectProfile | goToSourceScreen`), then calls `CHSNavigator.navigateToIndividualRegistrationDetails`, `proceedEncounter`, or the new `navigateBackAfterDoVisit`. This is an **internal dashboard → navigator** path driven by DB-configured report cards. It is **not** an external entry point and offers nothing to attach a URI handler to; the navigator methods it calls are the same ones we would call directly.
- **Upstream added the native half of deep-linking**: commit `f1cc1b73` (#1899, 23 Apr 2026, in v16.15+) adds `<intent-filter android:autoVerify="true">` for `https://${appLinkHost}/open/*` (`android/app/src/generic/AndroidManifest.xml`, `.../gramin/AndroidManifest.xml`) with `appLinkHost` as a `manifestPlaceholders` entry in `build.gradle` (`app.avniproject.org` for generic). **There is no JS-side handler**: `git grep` for `Linking.getInitialURL`, `addEventListener('url'` across `src/` returns nothing; `MainActivity.java` has no `onNewIntent`. So an `https://app.avniproject.org/open/...` link today opens the app on its normal landing screen and the URL is ignored.
- **Recommendation for Phase 4:** build on #1899 rather than a bespoke `DeepLinkActivity`. The diff is: (a) add a second `<data android:scheme="avni"/>` element to the *same* intent-filter (or a sibling filter in the generic flavor manifest), (b) one new small module `src/utility/DeepLinkHandler.js` that reads `Linking.getInitialURL()` + subscribes to `'url'` events once the app is authenticated and routes `avni://subject?uuid=` → `CHSNavigator.navigateToIndividualRegistrationDetails(source, uuid, null)` and `avni://register?subjectType=&structureId=&addressUuid=` → `CHSNavigator.navigateToRegisterView(source, {workLists, structureId, addressUuid})`, (c) wire it from `LandingView`/`RootView`. Both `https://app.avniproject.org/open/subject?uuid=…` and `avni://subject?uuid=…` can share the handler, which makes the upstream-offer story straightforward.
- **`navigateToRegisterView` and `addressUuid`:** the signature is unchanged upstream (`{workLists, groupSubjectUUID, taskUuid}`), so `addressUuid` (like our `structureId`) is a params addition. Pre-selecting the location needs one more line in `SubjectRegisterActions.onLoad` — the pattern already exists at L98: `newState.subject.lowestAddressLevel = context.get(AddressLevelService).findByUUID(uuid)`. So: 1 param in `CHSNavigator`, 1 line in `SubjectRegisterView.loadData`, ~3 lines in `onLoad`, and `clone()` — the same six-step shape as `structureId`.

### 1.2.5 Auth / IDP for the real server instance
The client does not hardcode the IDP; `AuthService.js:45` fetches `${SERVER_URL}/idp-details` at startup. The fork's generated `Config.js` points at `config/env/prod_dev.json` → `SERVER_URL = https://server.avniproject.org`. Live response on 2026-09-18:

```json
"idpType": "cognito",
"cognito": { "poolId": "ap-south-1_DU27AHJvZ", "clientId": "1d6rgvitjsfoonlkbm07uivgmg" },
"keycloak": { "authServerUrl": "", "clientId": "avni-client", "realm": "On-premise", "grantType": "password" }
```

**Conclusion: the production instance is AWS Cognito (SRP via `amazon-cognito-identity-js`, already a client dependency). There is no Keycloak realm to point the wrapper app at.** Phase 5 must implement Cognito username/password → ID/access token + refresh, and send `AUTH-TOKEN` the way `avni-webapp` does. Subject search for Phase 5: `POST /web/searchAPI/v2` (used by `avni-web-app`).

---

## 1.3 Fragility inventory

| # | Pattern | Where (file:line) | Detail / risk |
|---|---|---|---|
| 1 | **Hardcoded GIS URL, twice** | `GisSyncService.js:4` (`http://localhost:8000`), `SubjectRegisterActions.js:154` (inline literal) | `localhost` on a device is the phone itself — this only works with `adb reverse tcp:8000`. Two independent literals can drift apart. Must become one value from `Config.js`/env JSON. |
| 2 | **Structure→subject mapping store** | Django `map_subject_to_structure` (history snapshot) | Now a **JSON file on disk** next to `views.py` (`subject_structure_map.json`), rewritten on every POST — not transactional, not queryable, lost on redeploy, keyed only by `structure_id` (so a structure can map to exactly one subject and slum is not part of the key: `structure 12` in two slums collide). Needs a `SubjectStructureMapping` model. |
| 3 | **`AVNI_UUID_TO_SLUM_ID` dict** | Django `views.py` (history) | 4 hand-maintained entries. Every new slum = code change + deploy. `Slum` has no `avni_uuid` field. Options for Phase 2: add `avni_uuid` to `master.Slum` (admin-editable, one migration) — simplest and offline-safe; or resolve by name against Avni's AddressLevel API at request time (fragile: names differ, e.g. "Banthara Nagar Panchayat"). Recommend the model field. |
| 4 | **Coded-answer detection by UUID shape** | `MapPickerScreen.js:95–96` (`includes('-') && length > 30`) | Guessing. Any free-text answer ≥31 chars containing a hyphen is sent to `getConceptByUUID` and, if unresolved, its raw text is used — fine; but a Text answer that *is* 36 chars with hyphens gets mislabeled, and multi-select (`answer` is an **array** of UUIDs) fails the `typeof === 'string'` check and falls through to `String(parsed.answer)` → a comma-joined UUID string becomes the "answer" label and its own legend colour. `obs.concept.datatype` is already loaded (`obs.concept.name` is read at L140) — use `Concept.dataType.Coded` and `obs.getValueWrapper()`. |
| 5 | **Fire-and-forget mapping POST** | `SubjectRegisterActions.js:148–161` | The one write that creates the GIS↔survey link is unretried; on failure the only trace is an `alert`. Offline saves (the normal field case!) **always** fail this POST — the link is lost permanently. Needs a persisted queue flushed on sync. |
| 6 | **Module-level callback state** | `CHSNavigator.js:49` (`_mapPickerCallback`), `:625–639` | Global mutable state: (a) `_pendingStructureId` is never declared → implicit global (works only because Metro's babel preset sets `strictMode:false`; would throw under strict mode); (b) `handleConfirm()` in `MapPickerScreen.js:241–248` calls `goBack()` then fires the callback after a fixed **300 ms `setTimeout`** — a race against the router; (c) if the user backs out of the map, `_mapPickerCallback` is never cleared and fires on the *next* confirm from a different RegisterView instance; (d) two navigations overwrite silently. Is it load-bearing? Partly: `TypedTransition.with()` params are plain objects and functions *are* passed elsewhere in this codebase (`backFunction`, `onSaveCallback`, `onSuccessCB` in `CHSNavigator`), so **the callback can be passed as a navigation param** and the module-level store is not required. |
| 7 | **Regression: `CHSNavigator.goBack` removed** | `CHSNavigator.js:137–141` | Static method replaced by a stray instance method. Callers: `IndividualAddRelativeView.js:44`, `AddNewMemberView.js:69`, `RemoveMemberView.js:42`. |
| 8 | **3-concept filter list — confirmed still hardcoded** | `MapPickerScreen.js:15–26` (`FILTER_CONCEPTS`, `FILTER_LABELS`), rendered at `:481` | Not dynamic. The paper's "Dynamic Answer Discovery" claim is true for *answers*, not *concepts*. Phase 3 scope stands: derive the chip list from the Household registration form's Coded elements (`FormMappingService.findRegistrationForm(subjectType).getFormElementsOfType(...)` / iterate `formElementGroups[].formElements[].concept.datatype`). |
| 9 | **Colour literals duplicated** | `MapPickerScreen.js:28–32` (palette), `:352–365` (Leaflet `getStyle`, 4 status colours + grey), `:511` (`#bbb` legend), `:521–526` (default legend) | Same hexes in RN and in the WebView HTML string; no single source of truth. Phase 3 item. |
| 10 | **Debug code shipped to users** | `SyncComponent.js:1, 159–160, 212`; `SubjectRegisterActions.js:149, 153, 161`; `GisSyncService.js:21`; `MapPickerScreen.js:178, 209, 217, 232, 278` | `alert('sync pressed')` on every Sync tap; `alert('NOT CONNECTED')` replaces upstream's Bugsnag-aware error path; two alerts per household save. MapPickerScreen's five are user-facing messages but use bare `alert()` instead of the app's `AvniAlert`/i18n. |
| 11 | **Online-only map assets** | `MapPickerScreen.js:296–297` (Leaflet 1.9.4 from unpkg), `:318` (Google satellite tiles, no API key/ToS) | Without internet the WebView renders nothing — polygons are offline, the library that draws them is not. Paper lists both as "future"; flagged here because it contradicts the "offline first" architecture principle. |
| 12 | **First-slum-only** | `RegisterView.js:110` (`[...allLevels].find(...)`), `GisSyncService.js:15` (downloads *all* Slums on device) | Picks the first non-voided `Slum` AddressLevel in the whole synced hierarchy, not the worker's catchment; multi-slum users always get the same slum. Sync downloads every slum's polygons (~400 KB each). |
| 13 | **Number normalisation duplicated 5×** | `MapPickerScreen.js:72–77` (statusMap), `:150–154` (conceptMap), `:254–255` (search), `:269–272` (tap), `:327–332` (Leaflet `norm`) | Five hand-copied variants; `padStart(4,'0')` in RN vs `sid.length < 4 ? padStart : sid` in Leaflet already differ. `parseInt('0012a')` → 12 silently. Phase 2 item 6. |
| 14 | **`@turf/turf` for one bbox** | `package.json`, `MapPickerScreen.js:4, 224` | Pulls the whole turf bundle (~1 MB) into the app for a 6-line reducer. |
| 15 | **New Architecture disabled by code** | `MainApplication.java:61–62` | Redundant after sync (upstream sets `IS_NEW_ARCHITECTURE_ENABLED=false`, `build.gradle:81`). |
| 16 | **Secrets / config scan** | `android/local.properties` (gitignored): dead `GOOGLE_MAPS_API_KEY` → delete and rotate. `google-services.json` (5 flavors): Firebase `current_key` values — these are upstream's committed files, unchanged by us. `config/env/*.json`: only server URLs, no secrets. No `.env` files in the client. Django `shelter/settings.py:30`: literal `SECRET_KEY`, `ALLOWED_HOSTS = ['*']` (pre-existing, not GIS-related, but Phase 2 config extraction should cover it). Django mapping endpoint: `@csrf_exempt`, **no authentication** — anyone who can reach the server can rewrite mappings. |
| 17 | **Whole-file reformatting** | `CHSNavigator.js`, `RegisterView.js`, `SubjectRegisterView.js`, `SubjectRegisterActions.js`, `SubjectRegistrationState.js`, `Sync.js` | Prettier-style churn on ~400 lines that changed nothing; the main reason a verbatim rebase is painful and the reason the fork diff looks 5× larger than it is. |

---

## 1.4 Test coverage

| Target | Tests today | Notes |
|---|---|---|
| `GisSyncService.js` | **None** | No file under `packages/openchs-android/test/` references it. |
| `MapPickerScreen.js` | **None** | — |
| Number normalisation (3-variant lookup) | **None** | Logic is inline in 5 places (§1.3.13); not testable until extracted. |
| Concept-filter colour assignment | **None** | Inline in `loadConceptFilter()` (`MapPickerScreen.js:158–165`). |
| Django `get_structures_for_avni` / `map_subject_to_structure` | **None** | And no code in a repo to test against (§1.1). |

Test infrastructure that exists: `packages/openchs-android` uses Jest (`"test": "jest"`, preset `react-native`), with existing unit tests under `test/` (e.g. `test/action/…`, `test/utility/IssueUploadUtilTest.js`) that show the conventions (plain Jest, `EntityFactory` helpers). Django project (`Shelter_AVNI`) has app-level `tests.py` scaffolding only.

---

## Sync performed after this audit (approved plan, Step 3–4)

Recorded here so the audit and the repository state match. Details of what was ported and how are in the commit messages on `master`.

- `avni-client`: `master` reset to `upstream/master` (`9f7bda05`), old state preserved as branch `master-pre-upstream-sync` (`5c8395d`) and tag `legacy-zip-base` (`b09a568`). GIS changes re-applied as 4 commits (`a1b1ac8c` sync, `b8dc60e1` map screen, `7495066e` navigation, `98773d23` pre-fill); footprint vs upstream = 9 source files + `package.json`/`package-lock.json`. Deliberate deviations from the fork, as approved: `static goBack(source)` left intact; debug `alert()`/`console.warn` removed (`General.logError` instead); `_pendingStructureId` declared and `getPendingStructureId()` added (as the paper documents); GIS URL is one exported constant `GIS_SERVER_URL` (still `localhost:8000`, Phase 2 moves it to config); the empty-form `onLoad` path also keeps `structureId`; `GisSyncService` registered in upstream's new `AllServices.js` (a test enforces this). No reformatting. `MainApplication.java`/`build.gradle` changes dropped as redundant (§1.3.15). Verified: Jest 1759/1759 passing (2 suites skipped upstream), release bundle builds with the GIS modules included.
- Sibling repos: `avni-etl` → `11d3b8d` (2026-09-16), `rules-server` → `5feb362` (2026-06-01, upstream's latest), `avni-web-app` re-cloned → `6d4640c8` (2026-09-17); previous folder kept as `avni-web-app.old`.

## Prerequisites before Phase 2
1. **Restore the Django GIS views into `Shelter_AVNI`** (owner: user) from `~/.config/Code/User/History/60d5b7d7/Vvvh.py` (views, from `AVNI_UUID_TO_SLUM_ID` onward) and the sibling history dir's `urls.py` (2 routes). Without this, Phase 2 items 2, 3, 7 have no target.
2. Decide the GIS server hostname/port for field devices (the client currently assumes `adb reverse`), since Phase 2 item 1 needs the real value to put in `config/env/*.json`.
3. Delete/rotate the dead `GOOGLE_MAPS_API_KEY` in `android/local.properties`.
