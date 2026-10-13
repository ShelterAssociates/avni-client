# Shelter Associates × Avni — bug history

Problems found while building and testing the GIS integration, what actually caused them, and how
they were fixed. Kept separate from `FEATURES.md`, which describes only what the app does.

Useful when something similar reappears: several of these were not what they first looked like.

---

## 1. Catchment change looked like the app logging the worker out

**Symptom.** After an admin changed a worker's catchment or user group, the next sync appeared to
throw the worker out of the app. Reopening it showed the login screen. Reported as happening
"every time" on the Shelter build, and not on stock Avni.

**What it actually was.** A native crash, not a logout. The logs showed:

```
Fatal signal 11 (SIGSEGV), code 2 (SEGV_ACCERR) in tid (mqt_js)
#00-#06  librealm.so
#07+     libhermestooling.so / libhermes.so / libreactnative.so
```

A segfault inside Realm's own native library, on the JavaScript thread. Android restarted the
process, and a cold start lands on the login screen — which is what looked like a logout.

**Root cause.** A catchment change makes the server request a sync reset, which deletes every
local table while the home screen keeps re-rendering. The fork had added a map button to the home
screen whose visibility was decided **inside `render()`**:

```js
renderMapButton() {
    if (!mapAvailable(this.context)) return null;   // live Realm queries, during render
```

`mapAvailable()` queried AddressLevel, Privilege, SubjectType and FormMapping — exactly the tables
the wipe was deleting. Realm memory-maps its database file, so reading a row whose memory has just
been freed or remapped faults inside the mapping. A native segfault cannot be caught by
`try/catch`, so it kills the process.

**Why it looked intermittent.** It is a race. It only crashes when a render touches a row at the
same moment the wipe frees it. Stock Avni's home screen does no Realm reads in `render()`, so it
was never exposed.

**Fix.** `mapAvailableDuringRender()` — while any sync is running (foreground or background), the
answer comes from the last known value instead of touching Realm. Outside a sync there is no
competing writer, so querying is safe and the button stays accurate.

**Worth remembering.** Never query Realm from `render()`. The failure mode is a process-killing
segfault, not an exception.

### Things ruled out along the way
- **HTTP 401/403 handling.** `requests.js` maps both to the same `AuthenticationError`, and
  `SyncComponent` force-logs-out on it. A plausible suspect, but the logs never showed it firing,
  and both files are byte-identical to upstream.
- **Memory pressure.** No low-memory kill; the tombstone showed a genuine SIGSEGV.
- **The GIS structure files.** `GisSyncService.clearAll()` is never called anywhere, and the crash
  happened before the GIS phase of the sync was reached.
- **A stock-versus-fork comparison** was run to confirm the trigger code was identical: stock
  completed four wipe-and-resync cycles cleanly, and the trigger files show no diff from upstream.

---

## 2. House numbers saved in the wrong format

**Symptom.** Registering from the map stored the house number exactly as the GIS server had it, so
Avni held `35` where every other record used `0035`.

**Root cause.** `SubjectRegisterActions.onLoad` assigned the raw value:
`subject.setFirstName(String(action.mapStructure.structureId))`.

**Fix.** `formatHouseholdNumber()` pads the numeric part to four digits and keeps any letter
suffix, so `35` → `0035` and `22A` → `0022A`. Numbers already four digits or longer, and
non-numeric identifiers, are left untouched.

---

## 3. Map screen's bottom bar hidden behind the navigation buttons

**Symptom.** On the map screen the bottom bar sat under the Android navigation buttons, making
**View household** / **Register here** hard or impossible to tap. Every stock screen was fine.

**Two wrong attempts, and why they failed:**

1. Adding `paddingBottom: edgeToEdgeNavBarInset(insets)` to the bar. This returns 0 below
   Android 16, so on Android 15 it did nothing — the app opts out of edge-to-edge there via
   `windowOptOutEdgeToEdgeEnforcement`.
2. Keeping that on Android 16, where the opt-out is ignored. It *still* did nothing, because
   `SafeAreaInsetsContext` only has values when a `SafeAreaProvider` sits above it — and the map
   screen had none, so `insets` was `null` and the padding resolved to zero.

**Root cause.** Every stock screen wraps in `CHSContainer`, which supplies the provider (through
`NativeBaseProvider`) and reserves the navigation strip as a transparent bottom border, with a
context flag so nested screens do not reserve it twice. `MapPickerScreen` was a plain `<View>`.

**Fix.** Wrap the map screen in `CHSContainer` like every other screen, and delete the manual
padding.

---

## 4. Back from a form did not return to the map

**Symptom.** Map → house → registration form → Back landed on the Register page and then the
home screen, losing the slum, filter and zoom the worker was exploring.

**Root cause.** In the fork's own code. `MapPickerScreen.handleConfirm()` removed the map from the
navigation stack before opening the form — the comment said so outright: *"a registration replaces
the map"*.

```js
TypedTransition.from(this).goBack();                                // pops the map
setTimeout(() => CHSNavigator.invokeMapPickerCallback(...), 300);   // then opens the form
```

By the time Back was pressed there was no map left to return to. (Each form's own back arrow only
pops itself, which was never the problem.)

**Fix.** Let registrations open **on top of** the map, as household screens already did. Because
the screen stays mounted, the whole exploration context is preserved for free. This also removed
the 300 ms `setTimeout` that existed only to let the pop settle.

---

## 5. Second house could not be picked after returning to the map

**Symptom.** After fix 4, coming back to the map and tapping another house did nothing.

**Root cause.** A regression introduced by fix 4. The picker callback was one-shot:

```js
_mapPickerCallback(structureId, existingUuid, slumUuid);
_mapPickerCallback = null;      // fine when the map popped itself; fatal once it stays
```

**Fix.** The callback now lives as long as the map screen and is cleared in its
`componentWillUnmount`.

---

## 6. Map showed stale data after registering

**Symptom.** Register a house, come back, and it still showed as unsurveyed. Leaving the map and
reopening it showed the new data.

**Root cause.** The same consequence of keeping the map mounted: `statusMap` was built once when
the screen opened and never rebuilt.

**Fix.** `didFocus()` rebuilds it on return. The awkward part is that `statusMap` is baked into the
WebView's HTML, so setting it in state would regenerate the page and lose the map position. The
fix keeps the cached page keyed to the new map and patches the live page with an `updateStatus`
message instead. Measured at 1–2 ms on the test device.

---

## 7. Filter counts and answer colours still stale after registering

**Symptom.** After fix 6 the colours updated, but the filter list, its counts and the active
filter's colours did not until the map was closed and reopened.

**Root cause.** `refreshStatus()` rebuilt only the status map. The filter catalogue is built
separately by `loadFilters()` and cached per slum, and nothing re-ran it.

**Fix.** The refresh now also rebuilds the catalogue and re-applies the active filter. The cache is
keyed on household count, upload-queue size and last sync time, so unchanged data is still an
instant cache hit and only a real change pays for a rebuild.

---

## 8. Alphanumeric house numbers could not be typed

**Symptom.** House `22A` could not be searched for, nor registered as a house not on the map.

**Root cause.** Both inputs used `keyboardType="numeric"`, which on most Android keyboards offers
no letters at all — directly contradicting the padding support for letter suffixes.

**Fix.** Normal keyboard with `autoCapitalize="characters"` on both.

**Found by audit, not by testing.** Worth noting because it would only have surfaced when a
surveyor stood in front of a house with a letter suffix.

---

## 9. GIS download failed on tethered release builds

**Symptom.** `GIS download failed: Network request failed` when a release build pointed at a local
GIS server over `adb reverse`. The same setup worked in debug builds.

**Root cause.** `usesCleartextTraffic="true"` exists only in the **debug** manifest, so release
builds refuse plain HTTP. Not a regression — release builds never could reach a local server.

**Fix.** A network security config permitting cleartext **to loopback only**
(`localhost`, `127.0.0.1`), with everything else still HTTPS-only. Safe to keep permanently, since
nothing outside the device can reach its loopback.

---

## 10. Production returned HTTP 500 after deployment

**Symptom.** `get_structures_for_avni` returned a 500 error page on production immediately after
the server change was deployed, having returned 200 shortly before. This would have broken the map
for everyone, not just the new feature.

**Root cause.** The code referenced `AvniForm.shows_map` before the migration had been applied to
the production database.

**Fix.** Run the migration on production. Caught by checking the endpoint before building a tester
APK, rather than by a tester.

**Worth remembering.** Always verify the production endpoint returns 200 *and* contains the new
field before building an APK against it.

---

## 11. User-interface problems found in testing

| Symptom | Cause | Fix |
|---|---|---|
| Filter options needed horizontal scrolling | The legend was one horizontal strip, `maxHeight: 34` | Wrapping brick/chip layout, content-sized, no horizontal scroll |
| Large white gap between the chips and the map | React Native's `ScrollView` defaults to `flexGrow: 1`, so it reserved its whole `maxHeight` whatever the content | `flexGrow: 0`, so it takes only the height its rows need |
| Filter dropdown showed about three results and would not scroll | `listMode="SCROLLVIEW"` renders the list inline, where the map below clips it. Setting a `maxHeight` did not help because clipping, not height, was the problem | `listMode="MODAL"` — a full-screen scrollable list with its own search box |
| Only the admin-chosen filters were offered, hiding all others | `chosenConcepts()` returned only the chosen ones as soon as any existed | Chosen ones first, then every other coded concept |
| Map button opened an empty chooser | `mapAvailable()` never checked whether any registrable form was actually map-enabled | It does now, so the button and menu entry disappear instead |

---

## 12. Performance problems found by audit

Both found by reading the code after the stale-filter bug, on the principle that the same class of
problem usually repeats.

| Problem | Measurement | Fix |
|---|---|---|
| The home screen ran Privilege + SubjectType + FormMapping scans on **every** render to decide whether to show one button | 16 ms per call, and the home screen rendered 142 times in one short session — roughly 2.3 s of Realm work | Computed once and recomputed only after a sync could have changed the answer |
| Search suggestions rescanned every structure on every render, not only when typing | Full scan of up to a thousand buildings per keystroke *and* per unrelated re-render | The structure list is derived once per slum file and shared by suggestions, validation and the extras list |

---

## 13. Notes on diagnosis

Two habits that paid off and are worth repeating:

- **Read the native crash trace before theorising.** The "logout" was assumed to be an
  authentication problem for some time. The tombstone named `librealm.so` in the first seven
  frames and settled it immediately.
- **Compare against stock before blaming the fork, and vice versa.** A stock build of the same
  upstream commit was installed on the same account and put through the same trigger. That ruled
  out three wrong theories, and the eventual root cause was in fork-only code on the home screen —
  which the comparison also pointed at.
