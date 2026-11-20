---
phase: 08-test-sweep
plan: 03
completed: 2026-11-18
description: "Browser walkthrough as a new user on a local database"
type: Summary
about: "Runmate"
---


# Phase 8 Plan 03: Browser walkthrough Summary

**Four new accounts driven through the real app with Playwright (local Postgres on 5433, dev server on 3100, Clerk
keyless with testing tokens): sign-up, onboarding on the race path and "ohne Ziel", first plan, all seven pages at
1440 and 390 px, week editor, Plan anpassen, week review, export, account deletion. No console error and no
horizontal overflow at the end. Seven things were wrong on the way and are fixed.**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 No dead ends | Pass | Every nav page renders for a new account and for one with 32 runs; no error, no endless spinner |
| AC-2 Edits stick | Pass | Kettlebell marker on three days and the Zone 2 switch on a tempo day survive a reload and switch back clean (`plan_overrides` empty again) |
| AC-3 Findings fixed or listed | Pass | Below |

## Fixed

| Finding | Fix |
|---------|-----|
| Easy runs were measured against the profile's example pace, not the block's easy pace ("zu schnell" on a correct run) | 9d8c605, test |
| Year chart: "352 km mehr als 2025" for a runner with no 2025 | 9d8c605 |
| Form of −15 shown as "15" | 9d8c605 |
| Race page: sections without a heart-rate cap showed an empty cell | 9d8c605 ("nach Tempo", "alles, was da ist") |
| Plan progress said 97 of 108,5 km while readiness said 97 of 102,5: today counted as planned before it was run | c1d126c, test |
| Medium-long run was typed `tempo`, so the editor offered to "run it easy instead" | c1d126c, test |
| Weight from the training profile never reached Settings → Mein Profil; carb amounts used the example 70 kg | 5a05703, test in 7ccc9dc |

Also verified: export returns a ZIP with one JSON per table and a README (14 files); deleting an account needs the
typed phrase, removes every row, leaves one `deleted_users` entry and ends at `/sign-in`.

## Seen, not changed

- `/running`: "▲ 0 % zu den 4 Wochen davor" next to 176 km.
- Settings → Mein Profil asks for a marathon best time from half-marathon runners too, and lists most fields as
  example values right after the onboarding. Two profiles (training profile, Mein Profil) overlap — design pass.
- Blank areas on the plan page at 1440 px — design pass.
- Not driven: Paddle checkout, Garmin login, Apple Health Shortcut (need real accounts).
