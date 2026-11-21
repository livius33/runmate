---
description: "Runmate — milestone and phase structure"
type: Roadmap
about: "Runmate"
---

# Roadmap: Runmate

## Overview

v1.0 "Launch" (phases 1–7, docs/LAUNCH-PLAN.md) turned the private dashboard into a multi-user product in its own
repo. v1.1 "Shipping-ready" makes that product safe to put in front of strangers: tested, priced, with a plan page
that changes the whole plan, an onboarding that works for a new runner, and its own deployment.

## Milestones

| Version | Name | Phases | Status | Completed |
|---------|------|--------|--------|-----------|
| v1.0 | Launch | 1–7 | ✅ Merged (docs/phases/) | 2026-11-04 |
| v1.1 | Shipping-ready | 8–12 | 🚧 In progress | - |

## Current Milestone

**v1.1 Shipping-ready** (v1.1.0) — target: live by 2026-11-22

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 8 | Test Sweep & Fixes | 08-01 … 08-03 | ✅ 2026-11-18 |
| 9 | Free + Plus | 09-01 | ✅ 2026-11-18 |
| 10 | Plan anpassen | 10-01 … 10-03 | ✅ 2026-11-18 |
| 11 | Onboarding & Polish | 11-01, 11-02 | ✅ 2026-11-18 (11-02: reading to confirm) |
| 12 | Launch | 12-01 … 12-03 | 🚧 repo public, PR #4 merged; deployment needs Livius; 12-03 security fixes open |
| 13 | Instagram | 13-01 | 📝 planned, five decisions open |

### Phase 8: Test Sweep & Fixes
**Goal:** every feature does what it says, including the paths nobody clicks every day.
- 08-01 Plan edits keep every session field (kettlebell toggle jumps back: the save schema drops `strength`)
- 08-02 Sweep by four test agents: week editor + plan APIs · plan generator · plan adapter (engine, suggestions,
  pause) · data in/out, account, tenant isolation, secret scan. Each bug: failing test, fix, commit
- 08-03 Browser walkthrough as a new user on a local database (sign-up → onboarding → plan → edit → anpassen)

### Phase 9: Free + Plus
**Goal:** the hosted app has two states a runner understands, and nobody is locked out of their data.
- Self-host: everything, free. Hosted Free: sources, analysis, insights, one plan edited by hand, engine suggestions
  visible, export + delete. Plus: suggestions applied automatically, whole-plan rebuild (goal, date, interruption),
  several plans / B-race / own method, race-day tools, sleep and HRV in the plan
- Plus 9 €/month or 79 €/year; 30 days Plus without a card, then Free (not "expired")
- Code: `basic` tier becomes the free state, two Paddle prices instead of four, pricing page, upsell texts, docs

### Phase 10: Plan anpassen
**Goal:** one page changes the whole plan, as freely as the data allows, and explains every change.
- 10-01 Research note: changing goal/date/volume mid-plan, return after illness/injury/break, data needed per lever
- 10-02 Change model in lib: lever → preview (before/after: weekly km, key sessions, taper) → reason with numbers →
  data check (recommendation only with enough data; otherwise say what is missing and allow a manual value);
  past weeks stay as they are; undo
- 10-03 Page in four areas on a wide grid: Ziel und Rennen · Alltag · Unterbrechung · Vorschläge und Verlauf

### Phase 11: Onboarding & Polish
**Goal:** a new runner gets from sign-up to a useful overview without help.
- 11-01 Sign in → connect a data source (or skip) → goals, race and profile → first plan → overview; empty states
  on every page; running topics only
- 11-02 Week review card: short and to the point

### Phase 12: Launch
**Goal:** runmate.dev serves this repo, and the repo is public.
- 12-01 Deployment: own Vercel project, env, cron, domain move, Clerk production (incl. Google/Apple sign-in),
  Paddle prices, legal placeholders, secret scan, repo public, announcement. Steps with secrets are Livius'
- 12-02 Design pass: discussed with Livius first, then built
- 12-03 Security review before launch: findings of 2026-11-21 and their fixes

### Phase 13: Instagram
**Goal:** an Instagram account that posts four times a week from sourced material, with Livius approving, not writing.
- 13-01 Account, content pipeline (planner, fact check, renderer, approval, publisher, insights)

## Later

Strava source, English UI, native wrapper, Garmin developer program (official API).
