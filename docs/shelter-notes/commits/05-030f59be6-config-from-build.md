# 05. gis: server URL and API key come from Config.js, not source

| | |
|---|---|
| Commit | `030f59be6e551d9e412b5135e034404695f26bc7` |
| Short | `030f59be6` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

Takes the GIS server address and key out of the source. The key is a secret and the address differs
per environment, so both are injected at build time and read in exactly one place. The important
safety property arrives here too: with either value missing, every GIS feature switches itself off
quietly, which is what makes the same codebase safe to build for organisations that do not use the
integration.

## What the commit says

```
GIS_SERVER_URL and GIS_API_KEY are written into framework/Config.js by the
Makefile from make/environment variables (the key is a secret and the URL is
per environment, so neither belongs in config/env/*.json). src/gis/GisConfig
is the one place that reads them and the one place that talks to the GIS
server: GisConfig.fetch() attaches the X-Avni-Gis-Key header the server now
requires. With either value missing the polygon sync and the mapping POST
are skipped with a warning instead of failing against localhost.

GIS_SERVER_URL defaults to http://localhost:8000 (adb reverse) for dev builds.
```

## Files touched

```
Makefile                                           | 14 ++++++-
 .../src/action/subject/SubjectRegisterActions.js   |  6 +--
 packages/openchs-android/src/gis/GisConfig.js      | 38 +++++++++++++++++++
 .../openchs-android/src/service/GisSyncService.js  | 11 ++++--
 packages/openchs-android/test/gis/GisConfigTest.js | 44 ++++++++++++++++++++++
 5 files changed, 104 insertions(+), 9 deletions(-)
```
