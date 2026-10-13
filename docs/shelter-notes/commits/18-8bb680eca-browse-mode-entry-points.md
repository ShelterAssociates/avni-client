# 18. gis: open the slum map from home and the menu to look at registered households

| | |
|---|---|
| Commit | `8bb680ecad3154a6e804cb00efa07a0d96f471d9` |
| Short | `8bb680eca` |
| Date | 2026-09-19 |
| Phase | Phase 4 - field readiness |

## Why this exists

Turns the map from a step inside registration into something you can simply open and look at, from
the home screen or the menu. It asks which form you are filling so the map knows which subject type
to show, sharing exactly the choices the Register page offers. An "Opening map..." overlay was added
because the tap is followed by real work and looked like a hang.

## What the commit says

```
A map button on the home tab and a "Slum map" menu item ask which registration form you are filling
(the same choices as the Register page, now built in one place and shared with it), then open the map
in browse mode: a registered house shows who lives there and opens the household, an empty one starts
that registration. Register shows an "Opening map…" overlay so the tap is not mistaken for a hang.
```

## Files touched

```
packages/openchs-android/src/gis/mapBrowser.js     |  58 ++++++++++
 packages/openchs-android/src/gis/mapEntry.js       |   9 ++
 .../openchs-android/src/utility/CHSNavigator.js    |  10 +-
 packages/openchs-android/src/views/LandingView.js  |  17 +++
 packages/openchs-android/src/views/MenuView.js     |   8 +-
 packages/openchs-android/src/views/RegisterView.js | 128 +++++----------------
 .../openchs-android/src/views/gis/MapChoices.js    |  50 ++++++++
 packages/openchs-android/test/gis/mapEntryTest.js  |  22 ++++
 packages/openchs-android/translations/en.json      |   3 +
 packages/openchs-android/translations/gu_IN.json   |   3 +
 packages/openchs-android/translations/hi_IN.json   |   3 +
 packages/openchs-android/translations/ka_IN.json   |   3 +
 packages/openchs-android/translations/mr_IN.json   |   3 +
 packages/openchs-android/translations/ta_IN.json   |   3 +
 14 files changed, 217 insertions(+), 103 deletions(-)
```
