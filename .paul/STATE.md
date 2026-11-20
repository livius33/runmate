---
description: "Runmate — current position and accumulated context"
type: ProjectState
about: "Runmate"
---

# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-11-18)

**Core value:** A runner sees each day what to run and why; the plan can be changed freely and explains itself.
**Current focus:** v1.1 Shipping-ready — live by 2026-11-22

## Current Position

Milestone: v1.1 Shipping-ready (v1.1.0)
Phase: 12 (Launch)
Plan: 12-01 in APPLY — Claude's part done (clean-up, runbook, build check); waits for Livius (PR, keys, domain)
Status: Phases 8–11 complete on `feature/ship-v1.1`, one PR to `main`
Last activity: 2026-11-18 — browser walkthrough closed (08-03), summaries written, launch plans and runbook
Progress:
- v1.1 Shipping-ready: [████████░░] 80%

## Loop Position

```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ◉        ○
```

## Accumulated Context

### Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| Planning for v1.1 in .paul/ (PAUL); v1.0 stays in docs/phases/. The PAUL command files are not committed (no licence for redistribution) | 8 | `.claude/` is local only |
| One milestone branch `feature/ship-v1.1`, one PR to main: the phases depend on each other and stacked PRs are not used | 8 | Phase-wise commits |
| Tests never use the production database: local Postgres (port 5433), dev server on port 3100, Clerk keyless dev instance | 8 | `.env.local` of the worktree only |
| Hosted pricing: Free + Plus (9 €/month, 79 €/year), 30-day Plus trial without a card, then Free | 9 | Replaces Basic 6 € / Plus ~10 € |
| Plan anpassen: four areas; every lever has preview, reason with numbers and a data check; past weeks unchanged; nothing changes silently | 10 | New change model in lib/plan |
| "Feature card" in Livius' note is read as the week review overlay (dashboard PR #120 made it airier; still too large) | 11 | To confirm with Livius |

### Open questions for Livius

- "Feature card" = the week review overlay? (11-02 was built on that reading)
- Design pass (12-02): scope and direction; starting list in the plan
- Waitlist: wire a mail provider or open sign-up without billing (docs/launch/DEPLOY.md step 8)
- Rule decisions from the sweep (08-02 SUMMARY): low-volume long-run share, 4-run low weeks, floors and caps
- ACWR after a pause (08-02 SUMMARY, second pass): suspend ACWR as the only fatigue trigger for 28 days after a marked pause of ≥ 4 days? Needs a line in adaptation.md first
- Glitch activities stored before the plausibility filter stay in the data: clean them up once, or leave them?
- Base block for an unknown runner shows the example easy pace; undated onboarding race time as a recent race?
- Retention of idle Free accounts (12 months) and the § 312k confirmation through Paddle (09-01 SUMMARY)

### Blockers

- Deployment needs Livius: Clerk key swap on the dashboard project, new Vercel project with secrets, domain move
- Stage B (billing) needs the business registration, Paddle verification and the filled AGB
