# 22. Avni × Shelter Associates logos on the white screens, smaller mark in the header

| | |
|---|---|
| Commit | `7e9f48ddcc275b36b490761da969e43c68f2da87` |
| Short | `7e9f48ddc` |
| Date | 2026-09-19 |
| Phase | Phase 5 - branding |

## Why this exists

Settles the branding on showing both organisations together rather than replacing Avni's identity:
Avni's logo and Shelter's side by side, through one shared component so every screen stays
consistent.

## What the commit says

```
Avni's logo.png and splash_logo.png are back; the start-up, login and server-URL screens show both
logos side by side through one BrandLogos component, and the header mark is 70×20.
```

## Files touched

```
.../android/app/src/generic/assets/logo.png         | Bin 10478 -> 10150 bytes
 .../app/src/generic/assets/shelter-logo-dark.png    | Bin 0 -> 10478 bytes
 .../android/app/src/generic/assets/splash_logo.png  | Bin 10478 -> 10150 bytes
 packages/openchs-android/src/App.js                 |   6 +++---
 .../openchs-android/src/ServerUrlConfiguration.js   |   5 +++--
 packages/openchs-android/src/views/LoginView.js     |   6 +++---
 .../openchs-android/src/views/common/AppHeader.js   |   2 +-
 .../openchs-android/src/views/common/BrandLogos.js  |  15 +++++++++++++++
 8 files changed, 25 insertions(+), 9 deletions(-)
```
