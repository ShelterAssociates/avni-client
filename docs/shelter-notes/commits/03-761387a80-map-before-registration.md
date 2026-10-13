# 03. feat(gis): open the map picker before a new registration

| | |
|---|---|
| Commit | `761387a80dcf83bb69ab9d61ba5f61c83d3e4313` |
| Short | `761387a80` |
| Date | 2026-09-18 |
| Phase | Phase 1 - first working slice |

## Why this exists

Wires the map into the registration flow, so choosing to register a household opens the map first.
It also sets the rule that tapping an already-registered house opens that household rather than
creating a second one - the first defence against duplicates. Without a synced slum the form opens
directly, so the app still works where no footprints exist.

## What the commit says

```
RegisterView routes the registration, household and program-enrolment
actions through MapPickerScreen: the worker taps the structure on the map,
and the picked structure number is passed on as structureId. If the
structure already has a registered household the existing record is opened
instead (no duplicates). Without a synced Slum the form opens as before.

CHSNavigator gains navigateToMapPicker / invokeMapPickerCallback /
getPendingStructureId. Both module-level variables are declared (the
original branch left _pendingStructureId as an implicit global) and
CHSNavigator.goBack is untouched (the original branch had clobbered it).
```

## Files touched

```
.../openchs-android/src/utility/CHSNavigator.js    | 24 +++++++++++++++
 packages/openchs-android/src/views/RegisterView.js | 35 ++++++++++++++++++----
 2 files changed, 53 insertions(+), 6 deletions(-)
```
