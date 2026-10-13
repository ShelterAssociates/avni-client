# Shelter Associates × Avni — client customisation reference

_Last updated: 19 September 2026. Covers the Shelter fork of `avni-client` (`~/avni/avni-client`, branch `shelter-master`, 26 commits, merged with upstream `3056a2145` on 2026-10-13) and the matching changes in the Shelter GIS server (`~/Shelter/app`, Django)._

This document is the "what and why" of everything Shelter has added to the Avni mobile client. The companion document `SHELTER_AVNI_UPSTREAM_MERGE_GUIDE.md` is the "how to keep it alive when upstream Avni moves".

---

## 1. What the customisation does, in one paragraph

Shelter Associates surveys slum households with the Avni app. Shelter also digitises every slum's building footprints in its own GIS server (`app.shelter-associates.org`, Django + PostGIS). The customisation joins the two: the Avni app downloads each assigned slum's footprints during sync, shows them on a satellite map, lets a surveyor tap the house they are standing in front of instead of typing a house number, colours the houses by survey status and by survey answers, and records "household X lives in footprint Y" back on the GIS server. The map also works as a browsing tool (who lives where, what did they answer) and keeps working with no network.

---

## 2. End-to-end flow

```
 Avni server ──sync──▶ Avni app (Realm) ──┐
                                          │  MapPickerScreen (RN + Leaflet in a WebView)
 GIS server ─get_structures_for_avni─▶ files/gis/structures_<slum-uuid>.json ─┘
                                          ▲
 GIS server ◀─map_subject_to_structure── GisMappingQueue (disk queue, flushed after every sync)
```

1. **Sync** (`SyncComponent` → `GisSyncService.syncGisData`): after a successful Avni sync the app (a) flushes queued household↔structure links to the GIS server and (b) downloads `GET /component/get_structures_for_avni/?avni_uuid=<AddressLevel uuid>` for every synced `Slum` address level into `files/gis/structures_<uuid>.json`. Progress lines appear on the sync screen ("Downloading map 2/4: Alase Slum"). Failures are logged, never block the sync. **The newest successful download always replaces the saved file**, including one with fewer structures or none at all — structures get moved, renumbered and removed when a slum is re-digitised, so the latest response is the truth. The write is backup-then-commit: the saved file is renamed to `.bak`, the new one written, the `.bak` dropped on success and restored if the write throws, and a `.bak` left by a sync killed mid-write is recovered on the next run. The only payload refused is one that is not a slum file at all (`gisFile.isStructureCollection`), so a proxy error page cannot wipe good structures.
2. **Open the map** — three ways:
   - Register → subject type/program → map (**pick mode**): choosing an empty house opens the registration form with the house number pre-filled; choosing a registered house opens that household.
   - Home tab → round map button → "What are you filling?" → map (**browse mode**).
   - Menu → "Slum map" → same popup → map (browse mode).
3. **On the map**: satellite tiles (Google, online only), the slum boundary (yellow dashed), house footprints coloured by survey status, house-number labels (optional), search by number, dropdowns for slum and "colour houses by", a legend whose swatches are checkboxes, a details card for the selected household, a bottom bar with the action.
4. **Register**: `SubjectRegisterActions` puts the picked structure number into the household's `firstName`; on save `GisMappingQueue.record` queues `{subject_uuid, structure_id, avni_uuid}` and tries to POST it immediately; whatever is still queued is retried after every sync.

---

## 3. Features in detail

### 3.1 Map screen (`src/views/MapPickerScreen.js`)
| Area | Behaviour |
|---|---|
| Header | Avni `AppHeader` (dark bar, back arrow, slum name as title). |
| Notice banner | Amber, dismissible: "Structures are not available for X yet. Only the slum boundary is shown." or "No internet: satellite imagery is unavailable, structures are still shown." |
| Search | Number field with magnifier and clear ×; matches `structureKey` (so `0035`, `35`, ` 35 ` all find house 35); found house turns purple and the map zooms to it. |
| Controls row | Two inline dropdowns (`react-native-dropdown-picker`, same component Avni uses elsewhere): **Slum** (only when the worker has >1 slum) and **Colour houses by** (Survey status + the filters). Searchable past 8 entries. |
| Legend row | "House numbers" checkbox, then one swatch per legend row. Each swatch is a checkbox (tick on colour); unticking fades those houses on the map and removes their labels. Works for survey statuses (Not surveyed / Registered / Registered more than once) and for every answer of an active filter. |
| Map | Canvas-rendered footprints (fast for thousands), SVG only for striped duplicates; boundary layer; tap to select; labels for structures in view (all, or only coloured ones under a filter). |
| Household card | For a selected house with exactly one household: head-of-household name, `#number`, registration date, up to 4 answers — first one in bold as the headline (order = server "Map filters" order). × clears the selection. |
| Bottom bar | `#number` + action: **Use this** (pick mode, empty house) / **Register here** (browse mode, empty house) / **View household** / **View households** (duplicates → list to choose from). Household screens open *on top of* the map so Back returns to the map. |
| Loading | Spinner until file + status map are ready (~1–2 s on 1000 houses); the filter list fills in afterwards without blocking. Register shows an "Opening map…" overlay from the tap until the transition ends. |

### 3.2 Colours (`src/gis/colorCoding.js` — the single source)
- **Survey status**: not surveyed (green), registered (orange), registered more than once (red/white/orange **stripes**), selected (blue), search hit (purple), no data (grey), not selected under a filter (faint grey).
- **Filters**: an answer coloured on the Shelter website (a `Metadata` type-F row with `polycolor`) gets the **same colour in the app**; other answers take a 16-colour palette. Within one question no two answers share a colour until all 16 are used, then colours repeat.
- **Boundary**: yellow dashed outline.
- Everything the Leaflet page needs is injected as JSON; nothing is hard-coded in the HTML.

### 3.3 Filters (`src/gis/mapData.js`, `filterColors.js`, `observationAnswers.js`)
- **Which filters exist**: the coded concepts chosen on the GIS server (Admin → *Map filters*; see §5.3). Until any are chosen, every coded question of every viewable form is offered (backward compatible). Plus a **Duplicates** filter when any house has 2+ households.
- **Where answers come from**: registration form, then the household's enrolment forms, then its visits (newest first) — for every program/encounter type the user is allowed to view (`ProgramService.getAllowedViewPrograms`, `EncounterTypeService.getAllowedViewEncounterTypes`). A structure with several households takes the first household's answer. Multi-select answers become one combined label ("Yes + Shared").
- **Counts**: each filter shows how many households in the slum answered it; filters with zero answers are not offered.
- **Per-slum caching**: the filter list and the underlying answer table are built once per slum per session and reused until household count, pending-upload queue size or last-sync time changes.

### 3.4 Duplicates
Two or more households registered on the same house number (offline double registration) → status "Registered more than once", striped fill, `Duplicates` filter (label = number of registrations), and the bottom bar lists the households to open.

### 3.5 Browse mode entry points
- **Home tab**: round map button above the bottom bar (only when GIS is configured, a slum is synced and the user may register something).
- **Menu → Slum map**.
- Both open **"What are you filling?"** listing exactly the Register page's choices (each subject type, plus program registrations when the user's settings enable register-and-enrol). One choice → opens directly. The chosen form decides which subject type the map shows and which registration "Register here" starts. Register page and this popup share `registrationChoices()` / `workListsFor()` (`src/gis/mapBrowser.js`).

### 3.6 Offline behaviour
- Leaflet JS/CSS ship **inside the APK** (Gradle copies them from `node_modules/leaflet`); polygons, boundary, colours, labels, search and selection all work with no network. Fallback to the unpkg CDN only if the asset is missing; explicit error to the app if neither loads.
- Slum files are downloaded at sync and read from disk; the page reads the GeoJSON itself (`file://`), so no large string crosses the RN bridge.
- Only satellite imagery needs the network (banner explains).

### 3.7 Branding
- Header of top-level screens (Home, Register, Search, Menu): white Shelter logo + "× Avni" + divider before the title.
- Start-up/"Upgrading database" page, login, server-URL page, unhandled-error page: **Avni logo × Shelter Associates logo** side by side (`src/views/common/BrandLogos.js`).
- Assets in the **generic** flavour only: `android/app/src/generic/assets/{shelter-logo.png (white), shelter-logo-dark.png}`; Avni's `logo.png`/`splash_logo.png` untouched.

### 3.8 Configuration (`src/gis/GisConfig.js`)
`GIS_SERVER_URL` and `GIS_API_KEY` are baked into `src/framework/Config.js` by the Makefile (`GIS_SERVER_URL=… GIS_API_KEY=… make as_prod flavor=generic`), never committed. Without both, every GIS feature silently stays off (no sync, no map button). The key is sent as header `X-Avni-Gis-Key`.

---

## 4. Client code map

### New Shelter-only modules (no upstream counterpart)
| File | Responsibility | Tests |
|---|---|---|
| `src/gis/GisConfig.js` | Reads server URL / key from Config.js; `fetch()` with the key header; test override hook | `test/gis/GisConfigTest.js` |
| `src/gis/GisMappingQueue.js` | Disk queue of household↔structure links; `record`, `flush` | `GisMappingQueueTest.js` |
| `src/gis/structureNumber.js` | `structureKey()` normalises house numbers (`0035`→`35`, `0022 A`→`22A`); `STRUCTURE_KEY_SOURCE` string literal for the page (Hermes has no `fn.toString()`) | `structureNumberTest.js` |
| `src/gis/colorCoding.js` | All colours, palette, `assignAnswerColors`, legends | `colorCodingTest.js` |
| `src/gis/filterColors.js` | Website filter colours per concept/answer | `filterColorsTest.js` |
| `src/gis/observationAnswers.js` | `subjectObservations` (registration+enrolments+visits), `answerIndex`, `hasAnswer`, `valueLabeller`, `answerLabels` | `observationAnswersTest.js` |
| `src/gis/mapData.js` | `buildStatusMap`, `answerTable`, `buildFilterCatalog`, `applyFilter`, `codedConceptsOnForms`, privilege check | `mapDataTest.js` |
| `src/gis/mapCenter.js` | `mapCenter`, `hasStructures`, `hasBoundary` | `mapCenterTest.js` |
| `src/gis/householdSummary.js` | Details card data | `householdSummaryTest.js` |
| `src/gis/gisFile.js` | `isStructureCollection` payload check, `slumFileName` | `gisFileTest.js` |
| `src/gis/mapEntry.js` | Is the map available; synced slums | `mapEntryTest.js` |
| `src/gis/mapBrowser.js` | Registrable subject types, registration choices, work lists, `openMapBrowser` (Realm-backed glue, no unit tests) | — |
| `src/service/GisSyncService.js` | Download per slum at sync; progress messages | — |
| `src/views/MapPickerScreen.js` | The screen + the Leaflet page template | — |
| `src/views/gis/MapChoices.js` | "What are you filling?" popup | — |
| `src/views/common/BrandLogos.js` | Avni × Shelter logo pair | — |

Run the unit tests with `cd packages/openchs-android && npx jest test/gis` (78 tests).

### Upstream files touched (kept minimal — see the merge guide for each hunk)
`Makefile`, `.gitignore`, `android/app/build.gradle`, `package.json` (+`@turf/turf`, `leaflet`), `App.js`, `ServerUrlConfiguration.js`, `action/subject/SubjectRegisterActions.js`, `framework/errorHandling/UnhandledErrorView.js`, `service/AllServices.js`, `state/SubjectRegistrationState.js`, `utility/CHSNavigator.js`, `views/LandingView.js`, `views/LoginView.js`, `views/MenuView.js`, `views/RegisterView.js`, `views/SyncComponent.js`, `views/common/AppHeader.js`, `views/index.js`, `views/subject/SubjectRegisterView.js`, `translations/*.json` (keys `slumMap`, `openingMap`, `mapWhatAreYouFilling`).

---

## 5. GIS server side (`~/Shelter/app`, not in git — keep backups)

### 5.1 Endpoints (`component/avni_map.py`, both require header `X-Avni-Gis-Key`)
**`GET /component/get_structures_for_avni/?avni_uuid=<uuid>`** → gzip-able JSON
```json
{"type":"FeatureCollection","avni_uuid":"…","slum_id":1975,"slum_name":"Kala Nagar",
 "boundary": <Polygon geometry or null>,
 "filters": [{"name":"Has own toilet","concepts":["Current place of defecation","Final current place of defecation"],
              "answers":["Own toilet","Shared toilet"],"polycolor":"#00AA00","linecolor":"#004400"}],
 "map_filters": [{"concept_uuid":"…","concept_name":"Functioning of the structure"}],
 "total": 812,
 "features": [{"type":"Feature","geometry":{…},"properties":{"s":"35"}}]}
```
- **features**: `Component`s of the slum with `metadata.name == "Structure"`, or, when a slum has none, those with `metadata.code == "HouseBaseLayer"` (same fallback the website's export uses). `properties.s` = house number.
- **boundary**: the uploaded "Slum boundary" component, else `Slum.shape`.
- **filters**: every website filter row (`Metadata.type == "F"`, `code = "<rhs key>:<opt1>|,|<opt2>"`, `blob.polycolor`) translated to Avni concept names through `avni/mappings.py` (`RHS_KEYS`, `FACTSHEET_KEYS`, `SANITATION_KEYS`, reverse `KNOWN_QUESTION_MAP`). A key that maps to no concept is passed through as its own name and logged.
- **map_filters**: active `AvniMapFilter` rows in order (§5.3). Empty = not configured.
- 404 when the uuid is not in `avni/data/slum_location_uuids.json` (slum id → Avni AddressLevel uuid). **Every slum that should have a map needs a line there.**

**`POST /component/map_subject_to_structure/`** `{"subject_uuid","structure_id","avni_uuid"}` → upserts `SubjectStructureMapping` (component resolved from `Structure`/`HouseBaseLayer` by house number, accepting `35` and `0035`).

### 5.2 Model / migration
`avni.AvniMapFilter` (migration `avni/migrations/0002_avnimapfilter.py`): `question` FK → `AvniFormQuestion` (the cached Avni form questions; limited to coded, active), derived `concept_uuid` (unique) / `concept_name`, `order`, `is_active`. `on_delete=PROTECT`.

### 5.3 Admin
- **AVNI form questions** list: filter by data type *Coded*, tick questions, action **"Show selected concepts as map filters"** (needs `avni.add_avnimapfilter`). Non-coded rows are skipped with a message.
- **Map filters**: add one by searching the concept, reorder (`order`), switch off (`is_active`). The order is also the order of answers on the household card — put *Functioning of the structure* first.
- Access = standard Django permissions on `Map filter`.

### 5.4 Tests
`component/tests.py` — `GetStructuresTests`, `MapSubjectToStructureTests` (HouseBaseLayer fallback, boundary, filters, map_filters, mapping by padded number…). Run on the server's Python: `manage.py test component.tests avni`.

---

## 6. Performance & robustness record (1052-household slum, emulator)

| Phase | Before | After |
|---|---|---|
| Tap → map on screen | ~12 s, then frozen | 1.3–1.7 s first open, 0.8 s reopen |
| Filter list | 293 s **blocking the JS thread** | 4–8 s in background, then cached |
| Apply a filter | ~5 s freeze | ~0.3 s |
| Filter change | reloaded Leaflet (1–2 s, lost zoom) | in place |
| Offline | no map (Leaflet from CDN) | full map, imagery missing |

Techniques (see memory file "low-end devices"): measure with `Perf.mark/time` (`PERF| tag=map.*` lines in logcat, debug builds only); read Realm once into plain tables, in chunks that yield to the UI; show the screen before the heavy work; cache per session and evict; canvas instead of SVG; page reads the GeoJSON from disk; Leaflet in the APK; every failure path reports to the user instead of a grey map.

Known root causes fixed along the way: stale `android/build/generated/autolinking/autolinking.json` (run `npm run prebuild:android` after adding native deps); `Function.prototype.toString` under Hermes returns `[bytecode]`; `turf.bbox([])` gives a NaN centre; Kala Nagar digitised as `HouseBaseLayer`, not `Structure`.

---

## 7. Build & release (summary; full runbook in chat history / §8)
- Debug: `npx react-native run-android --mode=genericDebug` (Metro). Native rebuild needed whenever assets, Gradle or native deps change.
- Config: `GIS_SERVER_URL=https://app.shelter-associates.org GIS_API_KEY=<key> make as_prod flavor=generic`.
- Release: export the four `AVNI_APK_SIGNING` values from `~/Shelter/app/shelter/local_settings.py` as env vars, then `versionName=1.0.0 versionCode=1000 make create_apk flavor=generic`. Output: per-ABI APKs in `android/app/build/outputs/apk/generic/release/` (send `arm64-v8a`, keep `armeabi-v7a` for old phones). Increase `versionCode` every release.
- Signing: `android/app/shelter-generic-release-key.keystore` (git-ignored, backup in `~/Shelter/app/shelter/keys/`), alias `shelter-avni`, `KEY_STORE_PREFIX=shelter-`. Never lose it; never change it.
- First release: **1.0.0 / versionCode 8389608**, built 19 Sep 2026 from commit `adeb91b05`.

---

## 8. Operational checklist for a new slum
1. Digitise footprints as `Structure` (or `HouseBaseLayer`) and upload the slum boundary on the GIS server.
2. Add `"<slum id>": "<Avni AddressLevel uuid>"` to `avni/data/slum_location_uuids.json`; restart.
3. Surveyor syncs once on Wi-Fi → map available offline.

## 9. Ideas not yet built
Default filter on open; "near me" (GPS) button; search by head-of-household name; pre-cached satellite tiles per slum (storage trade-off); return to the map after saving a registration started from it; "map data from <date>" indicator.
