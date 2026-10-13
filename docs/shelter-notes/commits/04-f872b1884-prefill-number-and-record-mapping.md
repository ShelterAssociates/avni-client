# 04. feat(gis): pre-fill the household number from the picked structure and record the mapping

| | |
|---|---|
| Commit | `f872b18849815cbd2cceb1f18a3493c7ff5a6595` |
| Short | `f872b1884` |
| Date | 2026-09-18 |
| Phase | Phase 1 - first working slice |

## Why this exists

Closes the loop. The picked structure number becomes the household's name in Avni, and the
household-to-building link is sent back to the GIS server. Keeping the structure id on the
registration state (including through clone()) matters because otherwise it is lost the moment the
worker touches the first form field.

## What the commit says

```
Carries structureId from CHSNavigator.navigateToRegisterView through
SubjectRegisterView.loadData() into SubjectRegisterActions.onLoad, where a
new subject's name is set to the structure number. structureId is kept on
SubjectRegistrationState (including clone(), otherwise it is lost on the
first form interaction) so that onSave can POST the subject_uuid ↔
structure_id pair to the GIS server.

Differences from the original branch: the POST lives in
recordStructureMapping() and logs failures instead of alerting; the
empty-form onLoad path also keeps structureId; the GIS server URL is a
single exported constant in GisSyncService rather than two literals.
```

## Files touched

```
.../src/action/subject/SubjectRegisterActions.js   | 22 +++++++++++++++++++++-
 .../openchs-android/src/service/GisSyncService.js  |  5 +++--
 .../src/state/SubjectRegistrationState.js          |  1 +
 .../openchs-android/src/utility/CHSNavigator.js    |  3 ++-
 .../src/views/subject/SubjectRegisterView.js       |  1 +
 5 files changed, 28 insertions(+), 4 deletions(-)
```
