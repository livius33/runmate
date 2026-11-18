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
Phase: 8 (Test Sweep & Fixes)
Plan: 08-01 in APPLY; 08-02 running (four test agents)
Status: In progress
Last activity: 2026-11-18 — PAUL set up in this repo, milestone v1.1 defined
Progress:
- v1.1 Shipping-ready: [░░░░░░░░░░] 0%

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

- Design pass (12-02): scope and direction
- Confirm the reading of "feature card" (11-02)

### Blockers

- Deployment needs Livius: Clerk key swap on the dashboard project, new Vercel project with secrets, domain move
