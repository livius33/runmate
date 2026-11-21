---
phase: 12-launch
plan: 04
completed: 2026-11-21
description: "Hardening before the first deployment: sign-up route, headers, origin check, allowlist, consent, per-user limits, body limits"
type: Summary
about: "Runmate"
---


# Phase 12 Plan 04: Hardening before the first deployment Summary

**Ten commits on `fix/hardening-stage-a`, pull request #8 against `main`. No migration, no new dependency, no billing
file touched. Type check, 1015 tests and the build are green; the branch merges with #7 and with the billing branch
without conflicts.**

| AC | Result |
|----|--------|
| 1 Sign-up route | `/sign-up` exists. With billing off it redirects to `/#warteliste` (the plan said `/warteliste`, which has no page of its own) |
| 2 Headers | `X-Frame-Options`, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy (no `payment` entry, Paddle needs it); `no-referrer` on calendar and Apple Health routes |
| 3 Allowlist | `ALLOWED_EMAILS` is checked in `getUserId`/`withUser`, with a five-minute cache per user; 403 for accounts off the list |
| 4 Consent | Every route that stores typed-in health data asks for the consent; only a new or changed health value needs it, stored values sent back and clearing pass |
| 5 Garmin attempts | Sixth failed sign-in inside an hour is refused before Garmin is contacted; cooldowns on sync, history import, forced re-import, export |
| 6 Body limits | Waitlist 8 KB, Apple Health 1 MB, file import 21 MB (the import had no server-side cap before) |
| 7 Small fixes | Constant-time cron check in `lib/server/cron-auth.ts`, ICS escaping for a lone CR, fixed GCM tag length |
| 8 Green | tsc, vitest (117 files), build |

Beyond the plan: with `APP_HOST` set, Clerk accepts only sessions from that origin (`authorizedParties`) and signed-in
routes refuse state-changing requests from another site.

**Not verified:** the headers and the origin check against a running deployment; the neutral state of the sync button
on a cooldown in a browser. The throttle counters are settings rows and therefore part of the user's data export.

**Left for later:** rate rules for the anonymous routes and a `script-src` policy come with the Vercel Firewall after
the first deployment. The new billing reconcile cron (12-05) should use `lib/server/cron-auth.ts` once both branches
are on `main`.
