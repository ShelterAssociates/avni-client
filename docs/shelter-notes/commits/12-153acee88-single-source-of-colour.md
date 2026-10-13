# 12. gis: colorCoding.js is the single source of every map colour

| | |
|---|---|
| Commit | `153acee88c9c810fc25bb63adfbe2229112a3efa` |
| Short | `153acee88` |
| Date | 2026-09-18 |
| Phase | Phase 3 - extraction into src/gis |

## Why this exists

Pulls every colour into one module. The point is that the legend is generated from the exact colour
map the polygons use, so the two cannot disagree - a legend that lies about what is on the map is
worse than no legend. Answer colours follow the concept's answer order, so "Yes" keeps its colour
between slums and sessions.

## What the commit says

```
Survey-status colours (not surveyed / registered / duplicate / selected /
search hit / no data), the answer palette and the answer-polygon outline
live in one module with pure helpers: assignAnswerColors (wraps past the
palette), orderAnswerLabels (concept answer order first so 'Yes' keeps its
colour across slums and sessions), statusLegend and answerLegend (the
legend is derived from the exact colour map the polygons use).
```

## Files touched

```
packages/openchs-android/src/gis/colorCoding.js    | 71 +++++++++++++++++++++
 .../openchs-android/test/gis/colorCodingTest.js    | 73 ++++++++++++++++++++++
 2 files changed, 144 insertions(+)
```
