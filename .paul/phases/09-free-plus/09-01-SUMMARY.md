---
phase: 09-free-plus
plan: 01
completed: 2026-11-18
description: "Free + Plus instead of Basic and Plus"
type: Summary
about: "Runmate"
---


# Phase 9 Plan 01: Free + Plus Summary

**The hosted app no longer locks anyone out. A new account gets 30 days of Plus without a card and then continues as
Free: sources, analysis, one live plan edited by hand, engine changes as suggestions, export, delete. Plus
(9 €/month, 79 €/year) is the only paid plan: automatic adaptation, whole-plan rebuild, several plans and own method,
race-day tools, sleep and HRV in the plan (10ce371). Self-hosting keeps everything.**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 Ended trial is `free`, not locked | Pass | Entitlement tests; a stored `basic` counts as free |
| AC-2 Second live plan needs Plus | Pass | 402 `plus-required` with the upsell |
| AC-3 Free: engine changes are suggestions | Pass | Night flags join only with `recoveryInPlan` |
| AC-4 Export and delete never gated | Pass | Gating test |
| AC-5 `/api/billing` and the card offer Plus only | Pass | Route test; the card has no render test |
| AC-6 Landing page: Self-host, Free, Plus (de/en, structured data) | Pass | |
| AC-7 AGB and cancellation page name Plus only | Pass | |
| AC-8 No old price left | Pass | `docs/LANDING-PAGE.md` followed in 7ccc9dc |
| AC-9 tsc and tests green | Pass | |

Found while reviewing: Paddle.js sets a checkout's custom data in the browser, so a subscription could be attached to
another account. `GET /api/billing` now hands out an HMAC over the user id and the webhook ignores a claimed id without
it (0c8b6dc). **Needs `PADDLE_WEBHOOK_SECRET` set before the first checkout.**

Open for Livius: create the two Paddle prices; confirm 12 months as the retention for idle Free accounts; confirm
that Paddle's cancellation email serves as the § 312k confirmation; the AGB price placeholders (12-01).
