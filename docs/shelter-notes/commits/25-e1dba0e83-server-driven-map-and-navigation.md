# 25. gis: let the server pick which registrations use the map, and keep the map alive across one

| | |
|---|---|
| Commit | `e1dba0e83d2c4f6f414d93ce1617d80325b09c23` |
| Short | `e1dba0e83` |
| Date | 2026-09-26 |
| Phase | Phase 7 - configurability |

## Why this exists

Answers the two biggest pieces of field feedback. First, the map no longer stands in front of every
registration - which forms use it is now a tick-box in Shelter admin, travelling to the phone with
the normal sync, so it can change without an app release. Second, the map stops throwing away the
worker's context: registration forms open on top of it, so Back returns to the same slum, filter and
zoom, and the map re-reads what is registered when it comes back into focus. It also adds a way to
register and browse households whose number has no building drawn, with rules that keep house
numbers unique.

## What the commit says

```
The map stood in front of every registration and popped itself once a house was picked,
so a worker lost the slum, filter and zoom they were exploring and could not pick a
second house at all. Registration forms now open on top of the map, the picker callback
lives as long as the screen, and the map re-reads what is registered when it regains
focus - patching the live page rather than rebuilding it, so the view does not move.

Which subject types go through the map is now the GIS server's call: AvniForm.shows_map
travels in get_structures_for_avni as "map_registration_subject_types", is saved at sync
and read from one place. Every other form opens directly, and the home and menu entries
disappear when nothing is map-based.

- register and browse households whose number no structure covers, refusing a number
  that is drawn on the map or already taken
- suggest matching house numbers while typing, with their survey status
- open the slum and filter pickers as scrollable modals instead of clipped inline lists
- wrap the map screen in CHSContainer so its bottom bar clears the navigation buttons
- permit cleartext only to loopback, so a tethered build can reach a local GIS server
```

## Files touched

```
.../android/app/src/main/AndroidManifest.xml       |   1 +
 .../src/main/res/xml/network_security_config.xml   |   9 +
 .../src/action/subject/SubjectRegisterActions.js   |   2 +-
 .../openchs-android/src/gis/extraHouseholds.js     |  28 +++
 packages/openchs-android/src/gis/mapBrowser.js     |  12 +-
 .../src/gis/mapRegistrationForms.js                |  44 ++++
 .../openchs-android/src/service/GisSyncService.js  |   2 +
 .../openchs-android/src/utility/CHSNavigator.js    |  10 +-
 .../openchs-android/src/views/MapPickerScreen.js   | 266 +++++++++++++++++----
 packages/openchs-android/src/views/RegisterView.js |   8 +-
 .../openchs-android/src/views/gis/MapChoices.js    |  12 +-
 .../test/gis/extraHouseholdsTest.js                |  44 ++++
 .../test/gis/mapRegistrationFormsTest.js           |  18 ++
 13 files changed, 399 insertions(+), 57 deletions(-)
```
