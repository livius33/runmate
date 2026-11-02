# Phase 5 · Onboarding + demo — summary

Branch `phase-5-onboarding-demo` (from `main`, merged after Phase 6). Plan: [PLAN.md](PLAN.md).

Commits: `5b000c4` plan · `161e23b` retention + tombstone · `e23fef1` demo generator, read-only scope, seed script,
reset cron · `e6978c4` `/demo` pages and API · `f4ccdf4` onboarding · `7f6f482` merge of main (Phase 6) ·
`a23be3e` demo end-to-end test · `7009c83` docs (README, CLAUDE.md, `.env.example`).

## What shipped

**Onboarding** at `/onboarding` (protected):
- Steps: health-data consent (hosted only, Phase 4), profile, data source, goal. Source and goal can be skipped; there
  is a "Zurück" step and the flow resumes where it stopped. The server validates every step before saving it.
- HFmax "weiß ich nicht": 208 − 0,7 × Alter (Tanaka) with a ±10-bpm note; research note in `methodologies/research/paces.md` §2.2.
- Goal step: uses the existing season and drafts routes; the plan goes live from next Monday. "Erstmal ohne Ziel"
  starts a base block from next Monday (new `BaseSettings.start`).
- With billing on, the 30-day trial starts here.
- The dashboard sends new accounts to `/onboarding`; existing accounts get one "onboarding done" row on their first
  visit and never see it.

**Demo:**
- A deterministic synthetic "Hamburg HM" runner built with the real plan generator and engine: one missed key
  session caught up, four days Krank with graded return, a fatigue-guard event, cross-training, run and week feedback.
  No real personal data.
- With `DEMO_MODE=1`, `/demo/*` is public. The database layer refuses every write in the demo scope, including nested
  scopes. `/demo/api` serves only an allowlist of 26 read routes; every write returns 403 "Demo – nur ansehen".
- `/demo/settings` and `/demo/plan/neu` are left out because both write.
- Reset: `scripts/seed-demo.mts` or `/api/cron/demo-reset`.

**Billing follow-ups (approved):**
- Buying during the trial ends the trial (kept).
- Expired accounts: `dueForDeletion()` (12 months without activity, reminder 30 days before, `notice_sent_at`) plus
  `/api/cron/expired-accounts`. The mailer is an interface only, so nothing is sent or deleted until a provider exists.
- Tombstone `deleted_users` (in `lib/db/public-schema.ts`): a late Paddle webhook for a deleted account writes nothing.
- Migration `drizzle/0004_retention_tombstone.sql` (renumbered after Phase 6's `0003_waitlist`).

## Acceptance criteria

AC-1 … AC-12 pass, each backed by tests in `tests/onboarding/*`, `tests/demo/{generate,serve,smoke}.test.ts` and
`tests/billing/retention.test.ts`.

## Verification

- `npx tsc --noEmit` clean; vitest **69 files / 608 passed + 1 todo** (59 new); `next build` with an empty environment
  OK; `scripts/snapshot-plan.mts` byte-identical to `main` (7,662,683 bytes).
- Agent: `next start` with the demo held in memory (temporary harness, removed): all demo pages 200, POST 403.
- Coordinator re-ran tsc, vitest, the empty-env build and the snapshot on 2026-11-02. Not viewed in a browser: runmate
  has no database yet, and onboarding and demo need one.

## Deviations

- Existing accounts get one "onboarding done" row on their first visit.
- The tombstone table lives in `public-schema.ts` (no user id).
- Migration renumbered to `0004`.
- `/demo/settings` and `/demo/plan/neu` excluded (they write).

## For Livius to decide

1. Demo as a separate deployment with its own database, or on the main database?
2. A mail provider for the retention reminder; until then no expired account is deleted. The 12-month deletion also
   belongs in the Datenschutzerklärung.
3. No `/sign-up` page yet, so the demo's call to action links to `/sign-in`.
4. Onboarding offers only the book methods; the own method stays in `/plan/neu`.
5. Keep the Tanaka estimate for HFmax, or ask for a field test instead?
