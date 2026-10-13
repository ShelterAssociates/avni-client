# 07. gis: decide coded answers by concept datatype and support multi-select

| | |
|---|---|
| Commit | `1e7ebd5e73208f77441b06577bc76f59ab932df7` |
| Short | `1e7ebd5e7` |
| Date | 2026-09-18 |
| Phase | Phase 2 - hardening |

## Why this exists

Replaces a guess with a fact. Deciding whether a value was a coded answer by "contains a hyphen and
is over 30 characters" happened to work for some data and silently failed for the rest; multi-select
answers turned into a comma-joined list of uuids on screen. Answers are now resolved through the
concept's datatype and the answer list, and a multi-select household is keyed by its whole
combination, so "Yes + Shared" is its own colour rather than one answer arbitrarily winning.

## What the commit says

```
The concept filter used to guess that a value was a coded answer if it
contained a hyphen and was longer than 30 characters, and a multi-select
answer (an array of uuids) fell through to String() and became a
comma-joined uuid label. src/gis/observationAnswers now uses
concept.datatype === Coded and the observation's value wrapper, resolving
every selected uuid through ConceptService in the concept's answer order.

Colouring rule for multi-select: a household is keyed by all its answers
together ('Yes + Shared'), so each distinct combination gets its own colour
and legend row; no answer silently wins.
```

## Files touched

```
.../openchs-android/src/gis/observationAnswers.js  | 69 +++++++++++++++++++++
 .../openchs-android/src/views/MapPickerScreen.js   | 45 ++------------
 .../test/gis/observationAnswersTest.js             | 71 ++++++++++++++++++++++
 3 files changed, 144 insertions(+), 41 deletions(-)
```
