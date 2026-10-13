# 11. gis: tests override GisConfig settings instead of mocking Config.js

| | |
|---|---|
| Commit | `187d2759d4192edbb14b602526f08872f47e31a1` |
| Short | `187d2759d` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

A test-infrastructure fix. Config.js is generated and git-ignored, and mocking it virtually made
the GIS tests flaky in full-suite runs. Giving the tests an explicit settings override removed a
source of false failures.

## What the commit says

```
Config.js is generated and gitignored; a virtual jest.mock of it was keyed
differently from the real import in some full-suite runs and made the
GisConfig and GisMappingQueue tests flaky. GisConfig.override() gives the
tests a settings object explicitly.
```

## Files touched

```
packages/openchs-android/src/gis/GisConfig.js      | 15 +++++++++++--
 packages/openchs-android/test/gis/GisConfigTest.js | 10 ++++-----
 .../test/gis/GisMappingQueueTest.js                | 26 +++++++++++++---------
 3 files changed, 33 insertions(+), 18 deletions(-)
```
