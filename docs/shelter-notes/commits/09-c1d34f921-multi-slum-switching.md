# 09. gis: let a worker assigned to several slums switch between them on the map

| | |
|---|---|
| Commit | `c1d34f92111dec2b4f9259a70f006099ffcac814` |
| Short | `c1d34f921` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

Supports workers assigned to more than one slum, who previously always got whichever slum the app
found first. It also fixes a quiet data problem: status and filter colouring were computed from
every household on the device, so house 35 registered in one slum showed as registered in all of
them. Everything is now scoped to the slum on screen.

## What the commit says

```
RegisterView used to hand the picker the first Slum AddressLevel it found;
it now passes every synced Slum (sorted by name) and MapPickerScreen shows
a chooser behind the header title when there is more than one. Switching
reloads the polygons, status map and filters for that slum; a slum with no
polygons synced yet reopens the chooser instead of leaving the screen.
The picked slum's uuid travels back with the structure so the mapping is
recorded against the right slum.

Also fixes a latent cross-slum bug: the status and filter maps were built
from every household on the device, so house #35 registered in one slum
showed as 'registered' in every other slum. They are now built only from
subjects whose lowestAddressLevel is the slum on screen (voided excluded).
```

## Files touched

```
.../openchs-android/src/utility/CHSNavigator.js    |  12 ++-
 .../openchs-android/src/views/MapPickerScreen.js   | 112 ++++++++++++++++++---
 packages/openchs-android/src/views/RegisterView.js |  12 ++-
 3 files changed, 112 insertions(+), 24 deletions(-)
```
