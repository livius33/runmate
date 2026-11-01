# Runmate — notes for AI coding agents

Adaptive running-plan app: Garmin/Apple Health data in, a training plan generated from methodology templates and adapted
by a rule engine out. UI is German; code, comments and docs are English.

- **Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Drizzle ORM, Neon Postgres, Clerk auth, Vercel hosting.
- **Licence:** AGPL-3.0. Never add code you cannot license under it.

## Key directories

```
app/(dashboard)/         — pages: / (Plan), /plan/neu, /plan/anpassen, /running (Analyse), /running/activities, /season, /race, /settings
app/api/                 — API routes (garmin sync, running/*, season, calendar + health token routes, cron)
components/              — runs/, analyse/, plan/, settings/
lib/db/                  — Neon connection (lazy) + Drizzle schema (pg-core)
lib/api-clients/garmin.ts — Garmin Connect client (unofficial login)
lib/analytics/           — hr.ts (the one HR model), run-metrics, load (TRIMP, CTL/ATL/TSB, ACWR), progress
lib/plan/                — blocks registry, generator/, methodology/, engine, effective (edits), pause, events, race week/day
lib/plan/plan-files.ts   — hand-written plan files that are always registered (empty by default)
lib/insights/, lib/feedback/ — card texts and feedback rules (pure)
methodologies/           — templates (Markdown + YAML); research/ = the evidence behind the rules
examples/porto-2026/     — example hand-written block + its template (used by the tests)
tests/                   — Vitest, pure logic only; tests/setup.ts registers the example block
scripts/                 — migrate-schema.mjs, backfill-run-metrics.mts, check-methodologies.mts, simulate-plan.mts
```

## Rules

- Use `pgTable` (Postgres). After schema changes run `node scripts/migrate-schema.mjs` against your database.
- Never hard-code HR values; read `lib/analytics/hr.ts`. Athlete facts live in `lib/athlete.ts` (example defaults until
  per-user profiles exist).
- The block registry starts empty. Code must work with no block (`hasBlocks()`, `NO_BLOCK`) and must not special-case a
  block id; use block properties (`handWritten`, `base`, `paces`, `engine`).
- After changing `lib/analytics/run-metrics.ts`: bump `METRICS_VERSION` and run
  `npx tsx --env-file=.env.local scripts/backfill-run-metrics.mts --metrics`.
- Keep `npx tsc --noEmit` and `npm test` green. `next build` must work without a database.
- No personal data in code, tests or fixtures.
- Local dev runs on port 3001 (`npm run dev`).
- Every change on its own branch (`feature/…`, `fix/…`, `chore/…`) with a pull request to `main`.
