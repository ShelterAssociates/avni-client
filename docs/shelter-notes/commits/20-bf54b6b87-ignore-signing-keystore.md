# 20. Ignore the Shelter signing keystore

| | |
|---|---|
| Commit | `bf54b6b8793d6f2a911f7fc144a5172bd35b09ff` |
| Short | `bf54b6b87` |
| Date | 2026-09-19 |
| Phase | Phase 5 - branding |

## Why this exists

Keeps the release signing key out of the repository while letting it sit beside Avni's committed
one. Losing or leaking this key would be unrecoverable - every future release must be signed with
the same one.

## What the commit says

```
Signed releases use KEY_STORE_PREFIX=shelter-, so the key lives next to Avni's committed one but is
never committed itself.
```

## Files touched

```
.gitignore | 2 ++
 1 file changed, 2 insertions(+)
```
