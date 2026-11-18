# Runmate launch plan

Status: draft for Livius' review (2026-11-01). Sources: codebase audit, SaaS/legal research and landing-page plan
(2026-11-01); details in `docs/LANDING-PAGE.md`.

## Goal

Two products from one codebase:

1. **Open source** — public repo `runmate` under **AGPL-3.0**: anyone can clone, self-host and plug in their own data.
2. **Hosted** — runmate.dev as a multi-user web app: **Free** (0 €, a working product) and **Plus 9 €/month
   (79 €/year)**; a new account gets a 30-day Plus trial without a card and then continues as Free. Plus is billed via
   **Paddle** (merchant of record).

Out of scope: everything finance (Phase 10/11 of the private dashboard). The private `dashboard` repo stays as it
is (Porto block frozen); fixes are ported by hand.

## Decisions (2026-11-01)

| Topic | Decision | Why |
|---|---|---|
| Licence | AGPL-3.0, "Runmate" trademark, CLA for contributors | Real open source; a competing host must publish changes; CLA keeps dual licensing possible |
| Repo | Fresh repo from an allowlist copy, one initial commit — no `git filter-repo` | History holds a committed API key, a credential-like author field, personal health/finance data in 163 PAUL docs |
| Data sources | Garmin + Apple Health first; then Strava; file import (FIT/GPX/ZIP) | Livius; see "Data sources" for the legal path of each |
| Billing | Paddle | Seller of record handles EU VAT/OSS; least tax work for a German solo founder |
| Pricing | Free + Plus, Plus 9 €/month · 79 €/year, 30-day Plus trial, then Free; decided by Livius 2026-11-17 (replaces the two paid tiers of 2026-11-01) | Free is a working product, not a locked account after the trial; Plus stays well below Runna (19,99 €) / TrainingPeaks ($19.95) |
| Free vs. Plus | Free = sync and import, analysis, insights, one live plan edited by hand, the engine's changes as suggestions, export, delete; Plus = the engine applies its changes, whole-plan rebuild, several plans and B-races, own method, race-day tools, sleep and HRV feeding the plan | Decided by Livius 2026-11-17; rules in `lib/billing/entitlements.ts` |

## Data sources

| Source | Self-host | Hosted | Notes |
|---|---|---|---|
| Garmin | Password login with the user's own credentials (`garmin` source, experimental) — later Garmin **Personal** key (free, own data) | **Password login with each user's own credentials** (Livius' decision, Phase 3; consent text, encrypted, experimental) — later Garmin **Starter** program (free, business entity, push only, ~1 000 users, no history before connect) as a second source | Apply now; declare the paid model (agreement §5.2(e) needs written OK). History via Garmin data-export ZIP import. `garmin-connect` npm is unmaintained since 01/2024 and has no MFA — the official API is the long-term path; the adapter lets both run side by side |
| Apple Health | Runmate iOS Shortcut posting to a per-user secret link (exists: `/api/health/[token]`) | same, per-user token | HealthKit proper needs a native iOS app → later |
| File import | FIT / GPX / TCX / Garmin export ZIP | same | Account-free; fills history for Starter |
| Strava | OAuth | OAuth, ≤ 10 athletes without review | 2026 terms: 7-day cache limit, no AI use, own data only → import trigger, not source of record. Later |
| Polar / COROS / Suunto / Wahoo | — | later | AccessLink open to any Polar user; others need partner approval |

Adapter: `ActivitySource { connect, refresh, disconnect, listActivities, getActivityDetail, getDaily?, capabilities }`
with a neutral `source` + `source_activity_id` on activities; `parseDetailStreams` output is the normalised shape.

## Milestone v1.0 "Launch" — phases

### Phase 1 · Extraction (repo `runmate`, private until Phase 7)
- Allowlist copy from `dashboard` (app, components, lib, tests, methodologies, config) **without** finance
  (`app/(dashboard)/finanzen`, `app/api/finance`, `components/finance`, `lib/finance`, fin_* tables, AppHeader area,
  DKB calendar event), legacy tables (portfolios, holdings, habits, widgets), `api/debug/db`, personal docs (`.paul/`,
  `running_plan.md`, masterplan, seeds, `query_runs.mjs`).
- Porto 2026 becomes `examples/porto-2026` (sample block); no `'porto-2026'` special cases in code.
- LICENSE (AGPL-3.0), README, `.env.example` (no real values), neutral CLAUDE.md, CLA, gitleaks in CI.
- Fix the middleware hole (a session without an email claim passes) — also in the private dashboard.

### Phase 2 · Multi-user
- `user_id` on all 24 tables, `settings` keyed `(user_id, key)`, every query through `getUserId()`.
- `user_profile` replaces `lib/athlete.ts` and the `hr.ts` constants: HFmax/rest HR/LTHR → zones, PB, weight,
  timezone (replaces `todayInHamburg`), locale.
- Calendar + Apple Health tokens resolve to a user; daily cron loops over users (batched).
- Self-host: `ALLOWED_EMAILS`; hosted: open sign-up.

### Phase 3 · Data sources
- `ActivitySource` adapter; Garmin behind it (per-user encrypted credentials, no process-global client).
- Garmin login for self-host **and hosted** (Livius, 01.11.); official API as a placeholder source until approved
  (Personal for self-host, Starter for hosted); FIT/GPX/TCX/ZIP import. Done: [docs/phases/03-sources/](phases/03-sources/).
- Apple Health shortcut per user (install guide). Strava OAuth after launch.

### Phase 4 · Billing + legal
- Paddle subscriptions (Plus, monthly/yearly; 30-day Plus trial, then Free), webhooks → `subscription` table, entitlement checks
  for Plus features, cancellation button (§312k BGB), customer portal.
- Impressum (§5 DDG), Datenschutzerklärung (Art. 13), AGB, withdrawal right; **Art. 9 explicit consent** for health
  data; self-service export (Art. 20) and deletion (Art. 17); processing record + light DPIA; DPAs with Vercel (Pro),
  Neon (Frankfurt), Clerk (auth data only), Paddle; regions Neon `aws-eu-central-1`, Vercel `fra1`.
- Disclaimer: "kein Medizinprodukt" — never claim diagnosis or health outcomes (MDR).

### Phase 5 · Onboarding + demo
- Onboarding: profile (HR, PB, goal), connect a source or import, pick a method, first plan.
- Demo instance: read-only, synthetic athlete ("Hamburg HM", one missed session, one pause, one fatigue event), reset
  nightly. Same seed produces the landing-page screenshots.

### Phase 6 · Landing page (see `docs/LANDING-PAGE.md`)
- `app/(marketing)` route group, static; `ClerkProvider` only in the dashboard layout; dashboard moves to `/plan`.
- Sections: hero, built in the open, how it works, methods, adaptive engine, insights, race day, pricing
  (self-host 0 € · Free 0 € · Plus), FAQ, CTA, footer; de at `/`, en at `/en`; dark tokens; cookieless analytics;
  waitlist with double opt-in until billing is live.

### Phase 7 · Launch
- Self-host docs (`docker compose up` with Postgres; Neon + Vercel guide; local auth path for self-hosters).
- gitleaks/trufflehog clean → **flip the repo to public (Livius' go)**.
- Announce: r/selfhosted → Show HN → r/AdvancedRunning → r/Garmin → r/laufen → intervals.icu forum; Product Hunt once
  hosted billing is live. Good moment: right after Porto (8.11.) with the real race result.

## Livius' to-dos (cannot be done by Claude)

1. Revoke the NYT API key in `dashboard` commit `2faef78`; check the author-email string in `314b5aa` and rotate it if
   it was a real password.
2. Business basics: Gewerbe registration (needed for Garmin Starter and Paddle), Steuerberater on Kleinunternehmer
   §19 UStG with Paddle as seller, Impressum address that can receive legal service.
3. Apply for Garmin Connect Developer Program (Personal now; Starter with the business entity).
4. Paddle account + verification; Vercel Pro (DPA); Neon project in Frankfurt.
5. Trademark search/registration "Runmate" (DPMA/EUIPO).
6. Create the two Plus prices in Paddle (9 €/month, 79 €/year); the feature split and the price are decided (2026-11-17).

## Effort (rough)

Phase 1: 1–2 days · Phase 2: 4–6 days · Phase 3: 4–6 days (+ Garmin approval wait) · Phase 4: 3–4 days ·
Phase 5: 2–3 days · Phase 6: 3–4 days · Phase 7: 1–2 days.
