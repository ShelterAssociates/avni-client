# Shelter Associates — fork notes

Documentation for everything this fork adds to stock Avni. Lives in the repo so it is versioned
with the code it describes and visible to anyone with the fork.

- **Fork:** `ShelterAssociates/avni-client`
- **Our branch:** `shelter-master` — all Shelter work
- **Mirror branch:** `master` — always byte-identical to `avniproject/avni-client`, never receives our commits
- **State:** 27 Shelter commits, merged with upstream `3056a2145` on 2026-10-13

## The documents

| Document | What it answers |
|---|---|
| [`FEATURES.md`](FEATURES.md) | What the Shelter build does that stock Avni does not. For field staff, admins and new developers |
| [`CLIENT_CHANGES.md`](CLIENT_CHANGES.md) | The what-and-why of every customisation, client and Django GIS server together |
| [`FILE_INVENTORY.md`](FILE_INVENTORY.md) | File counts, every file we added, every Avni file we modified, ranked by merge-conflict risk |
| [`UPSTREAM_MERGE_GUIDE.md`](UPSTREAM_MERGE_GUIDE.md) | How to bring in a new upstream release, and how to know when you are done |
| [`UPSTREAM_MERGES.md`](UPSTREAM_MERGES.md) | Log of merges actually performed — what came in, what conflicted, how it was resolved |
| [`BUG_HISTORY.md`](BUG_HISTORY.md) | Bugs found in the field and what fixed them |
| [`AUDIT.md`](AUDIT.md) | Historical audit of the fork's provenance and the Django side |
| [`commits/`](commits/) | One file per Shelter commit, oldest first — see [`commits/README.md`](commits/README.md) |

## Keeping this current

| When | Do this |
|---|---|
| After a Shelter commit | Add `commits/NN-<short-sha>-<slug>.md` and a row in `commits/README.md` |
| After an upstream merge | Prepend an entry to `UPSTREAM_MERGES.md`; refresh the numbers in `FILE_INVENTORY.md` using the commands in that file |
| After a release | Update the release line in `FEATURES.md` |
| After a field bug | Add to `BUG_HISTORY.md` |

## What is deliberately *not* here

Survey data stays out of this repo. `~/avni/documentation/` holds ~145 MB of
`household_code_*.pdf` exports and device ZIPs that were **not** moved in:

> This fork is **public on GitHub**. Those PDFs are per-household survey exports containing real
> residents' personal data, and git keeps committed files in history forever, even after deletion.
> They must stay out of the repository.

Also still outside the repo: `Avni Slum Map — Status & Roadmap.pptx` (a binary that diffs poorly;
move it to shared storage rather than git).
