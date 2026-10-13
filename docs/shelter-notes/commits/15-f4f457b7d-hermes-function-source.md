# 15. gis: page-side structureKey as a string literal, Hermes has no function source

| | |
|---|---|
| Commit | `f4f457b7d2d1e5093cf4acfdb2da62031208477f` |
| Short | `f4f457b7d` |
| Date | 2026-09-19 |
| Phase | Phase 4 - field readiness |

## Why this exists

A sharp platform lesson. The Leaflet page rebuilt the house-number function from
`structureKey.toString()`, which under the Hermes engine returns `{ [bytecode] }` rather than source.
The page threw on its first style call and drew nothing at all. The source is now a literal kept in
step with the real function by a test that re-evaluates it the way the page does.

## What the commit says

```
structureKey.toString() returns "{ [bytecode] }" under Hermes, so the Leaflet page threw on its
first style call and drew no polygons. The source is now a literal kept in step with the function
by the tests, one of which loads the module with a Hermes-style toString.
```

## Files touched

```
packages/openchs-android/src/gis/structureNumber.js     | 17 ++++++++++-------
 .../openchs-android/test/gis/structureNumberTest.js     | 14 ++++++++++++++
 2 files changed, 24 insertions(+), 7 deletions(-)
```
