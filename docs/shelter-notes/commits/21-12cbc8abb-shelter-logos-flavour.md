# 21. Shelter logos in the generic flavour: dark on white screens, white on the header

| | |
|---|---|
| Commit | `12cbc8abba04028cbd810e9246dfd8b33fa9fe6d` |
| Short | `12cbc8abb` |
| Date | 2026-09-19 |
| Phase | Phase 5 - branding |

## Why this exists

Applies Shelter's logo to the white screens - login, server address and start-up - and a white
variant in the dark header.

## What the commit says

```
logo.png and splash_logo.png (login, server-URL and start-up screens, white background) are now the
Shelter Associates logo; the header mark uses the white variant and is larger.
```

## Files touched

```
.../android/app/src/generic/assets/logo.png         | Bin 10150 -> 10478 bytes
 .../android/app/src/generic/assets/shelter-logo.png | Bin 33445 -> 43171 bytes
 .../android/app/src/generic/assets/splash_logo.png  | Bin 10150 -> 10478 bytes
 .../openchs-android/src/views/common/AppHeader.js   |   2 +-
 4 files changed, 1 insertion(+), 1 deletion(-)
```
