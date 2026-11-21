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
Plan: 12-01 in APPLY — repo public (2026-11-19), PR #4 merged (2026-11-20), Vercel project `runmate` prepared; waits for Livius (keys, GitHub access for Vercel, domain). 12-04 built (PR #8, not merged), 12-05 built (PR #9, not merged), 12-06 after their merge, 12-07 waits for decisions; 12-02 (redesign) planned, not started; 13-01 tasks 2–4 built locally, tasks 5–8 wait for the account
Status: Phases 8–11 on `main`; runmate.dev still serves the personal dashboard (404 for visitors)
Last activity: 2026-11-21 — 12-05 reviewed, fixed and in PR #9; redesign plan 12-02; 12-04 summary, 13-01 progress note
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
| Design reference: `DESIGN.md` (third-party analysis of Vercel's design language) for type, spacing, radius, elevation and component shape; Runmate's colours, German UI text and the wide-grid rule stay | 12 | Plan 12-02; the file is on the local branch `design/12-02-design-md` |
| Instagram defaults until Livius says otherwise: German only, every post approved, pipeline in its own local repository, handle as a config value, no post before runmate.dev and the Impressum are live | 13 | 13-01 tasks 2–4 built on them |

### Open questions for Livius

- "Feature card" = the week review overlay? (11-02 was built on that reading)
- Redesign (12-02): Inter → Geist, card radius 12–16 px → 8 px, smallest text 12 px, app stays light; the plan takes these as defaults and shows three reference screens before the rollout
- Two overlapping profiles (Plan anpassen → Alltag and Settings → Mein Profil): merge them? Not part of 12-02
- Waitlist: wire a mail provider or open sign-up without billing (docs/launch/DEPLOY.md step 8)
- Rule decisions from the sweep (08-02 SUMMARY): low-volume long-run share, 4-run low weeks, floors and caps
- ACWR after a pause (08-02 SUMMARY, second pass): suspend ACWR as the only fatigue trigger for 28 days after a marked pause of ≥ 4 days? Needs a line in adaptation.md first
- Glitch activities stored before the plausibility filter stay in the data: clean them up once, or leave them?
- Base block for an unknown runner shows the example easy pace; undated onboarding race time as a recent race?
- Retention of idle Free accounts (12 months) and the § 312k confirmation through Paddle (09-01 SUMMARY)
- Mail provider and sender address, or open sign-up without a waitlist (12-07)
- Deleting expired accounts on a schedule: yes or no, from when (12-07)
- AGB: is a cancellation through the form confirmed by e-mail to the account's address (12-05)
- Held cancellation requests (form request after a take-back waits for the owner's confirmation): compatible with § 312k BGB? To settle before stage B (12-05 SUMMARY)
- Trial restart after deleting an account (12-05 AC-8): accept it, or keep a hash of the address
- Link tokens as hashes, Garmin consumer pair in an env var, key ids for `ENCRYPTION_KEY` (12-07)
- Instagram (13-01): handle, account, Meta app and token; a private GitHub repository for the pipeline; start date

### Blockers

- Deployment needs Livius: Vercel's GitHub app needs access to this repo, secrets into the Vercel project `runmate`, then the domain move
- Dependency updates (#7) and the hardening (#8) must be merged before the first deployment; #9 before stage B
- Stage B (billing) needs the business registration, Paddle verification and the filled AGB
