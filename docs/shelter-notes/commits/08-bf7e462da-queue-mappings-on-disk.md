# 08. gis: queue structure mappings on disk and retry after every sync

| | |
|---|---|
| Commit | `bf7e462dae6dade19300436bb4e36ca328395758` |
| Short | `bf7e462da` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

Makes the household-to-building link survive the field. It used to be fire-and-forget, so with no
network at save time - the normal case - the link was simply lost. Now it is written to disk before
the first attempt and retried after every sync, with transient failures kept and permanent ones
dropped. The slum uuid joins the payload here too, because house numbers repeat across slums.

## What the commit says

```
The POST that links a household to its building footprint used to be
fire-and-forget: with no network at save time (the normal case in the
field) the link was lost for good. GisMappingQueue persists each mapping to
<gis dir>/pending_mappings.json before the first attempt and flushes the
queue at save time and at the start of every successful Avni sync.
Transient failures (offline, 5xx, 401/503) stop the flush after one hit;
400/404 are permanent and dropped with an error log.

The server needs the slum as well as the number (house numbers repeat
across slums), so the registration chain now carries
mapStructure = {structureId, slumUuid} in place of the bare structureId.
```

## Files touched

```
.../src/action/subject/SubjectRegisterActions.js   |  25 +++--
 .../openchs-android/src/gis/GisMappingQueue.js     | 106 +++++++++++++++++++++
 .../openchs-android/src/service/GisSyncService.js  |   3 +
 .../src/state/SubjectRegistrationState.js          |   2 +-
 .../openchs-android/src/utility/CHSNavigator.js    |   4 +-
 packages/openchs-android/src/views/RegisterView.js |  17 ++--
 .../src/views/subject/SubjectRegisterView.js       |   2 +-
 .../test/gis/GisMappingQueueTest.js                |  86 +++++++++++++++++
 8 files changed, 219 insertions(+), 26 deletions(-)
```
