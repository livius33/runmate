# Phase 4 · Billing + legal — summary

Branch `phase-4-billing-legal` (from `main`, local only, not pushed). Plan: [PLAN.md](PLAN.md).
(Intended path: docs/phases/04-billing-legal/SUMMARY.md — writing it there was blocked for the agent.)

Commits: `3ac22b5` plan · `5f00771` tables + migration 0002 · `49c3b58` entitlements, server checks, engine
suggestions · `64f0c5b` legal pages, ClerkProvider move · `8cc252b` Paddle, webhook, trial, portal, cancellation ·
`a931bf5` Art. 9 consent · `ec9fee5` export, deletion, Clerk webhook · `b97edbd` page tests, docs, env.

## What shipped

**Entitlements (`lib/billing/entitlements.ts`, pure).** The plan state comes from the subscription row: `self-host`
(no `BILLING_ENABLED`), `trial` (30 days from the first sign-in, no card), `basic`, `plus`, `past_due` (keeps its tier
while Paddle retries the payment) and `expired` (trial over, cancelled after the period end, or paused). Features are
`sync, plan, autoAdapt, multiPlan, ownMethod, raceDay, export, delete`:
- self-host, trial and plus get everything;
- basic gets sync and plan, with one live plan;
- expired gets export and delete only, and the data stays readable.

On the server, `requireFeature()` and `currentEntitlements()` (cached per request) answer 402 with a calm German text
for these Plus actions: saving an own method, a second live plan (finished blocks don't count), going live with an
own-method plan, the race analysis and ticking the checklist. In the UI, `useEntitlements()` comes from the dashboard
layout, `<Upsell>` shows the upsell text, and a header notice appears for past_due, expired and a trial that is
about to end.

**Engine without Plus.** `runEngine` is untouched. The store saves only the engine's corrections and notes. Its new
plan changes come back as `suggestions`, reverted from the result via each change's `before`. The Plan page lists
them under "Vorschläge für deinen Plan":
- Übernehmen applies exactly that change, with `before` re-read from the saved state;
- Ablehnen vetoes it.

**Paddle (`lib/billing/`, no SDK).**
- Tables and migration: `subscription` (one row per user) and `billing_events` (event id as primary key), in
  `drizzle/0002_billing_legal.sql`.
- Webhook `/api/billing/webhook` (public):
  - checks `Paddle-Signature` (HMAC-SHA256 over `ts:body`, constant-time, 5 min tolerance, several h1 allowed);
  - skips duplicate event ids and ignores stale `occurred_at`;
  - finds the user from `custom_data.userId` or the stored Paddle ids;
  - handles `subscription.*` and `transaction.completed`;
  - an unknown price or user gets 200 and writes nothing.
- Settings → **Abo** loads Paddle.js on demand. It shows the status, the trial end, renewal or end date, the Basic and
  Plus buttons per month and year, and the customer portal.
- **Kündigungsbutton:**
  1. "Verträge hier kündigen" in Settings and the footer leads to the public `/kuendigen`.
  2. Signed in, the contract is shown; otherwise the user gives a name and the account email.
  3. The user picks the kind of cancellation (and a reason for an extraordinary one), then **Jetzt kündigen**.
  4. Paddle cancels with `next_billing_period`.
  5. A printable confirmation shows the date, time and end date, and the request is stored in settings.

**Legal (`app/(legal)/`).** `/impressum`, `/datenschutz` and `/agb` are static, `/kuendigen` is dynamic. ClerkProvider
moved into the dashboard and sign-in layouts, so the legal pages ship 103–107 kB and no Clerk JS. Each page has the
review banner, and there are about 30 `[PLATZHALTER: …]` in total. The disclaimer component appears in the footer, on
the sign-in page, in Settings and as AGB §3.

**Art. 9 consent (`lib/legal/`).**
- Table `consents` stores version, granted_at and revoked_at; the text version is `2026-11-02`.
- Asked only when billing is on or `REQUIRE_HEALTH_CONSENT=1` is set.
- `intakeBlocked()` checks the consent and the `sync` feature. It guards connect, sync, history, import, the Health
  link and the Health push. The cron skips these users and counts them as `inactive`.
- Settings → Gesundheitsdaten: grant, see date and version, revoke. After revoking it offers to delete activities,
  streams and health values.
- Garmin consent text reviewed: login in the user's name, credentials sent to Garmin, unofficial and possibly against
  Garmin's terms, plus a pointer to the Art. 9 consent.

**Own data (`lib/account/`).**
- `userTables()` reads the user tables from the schema, children first.
- Export: a ZIP (fflate) with one JSON file per table and a README. JSON columns are parsed; `*Enc` columns and link
  tokens are left out.
- `deleteAccount()` cancels Paddle `immediately`, deletes all rows, then deletes the Clerk user. From Settings it is
  strict (it stops if Paddle fails); from the webhook it deletes anyway and logs.
- `/api/webhooks/clerk` (Svix signature, no dependency) runs the same deletion on `user.deleted`.
- Settings → Meine Daten: export, and deletion behind a typed "LÖSCHEN".

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC-1 entitlements | ✅ | `tests/billing/entitlements.test.ts` |
| AC-2 server gating | ✅ | `tests/billing/gating.test.ts` (402, no writes; Plus and self-host pass; second live plan; expired) |
| AC-3 engine suggestions | ✅ | `tests/billing/suggestions.test.ts` (property tests: accepting all suggestions = the Plus result; accepting one changes only its days); snapshot identical |
| AC-4 signature | ✅ | `tests/billing/paddle.test.ts` (missing, wrong secret or body, too old, malformed, secret rotation; 401 without DB access) |
| AC-5 idempotency | ✅ | same file: a duplicate event writes nothing |
| AC-6 transitions | ✅ | created → past_due → scheduled cancel → canceled; stale events; plan change; transaction before the subscription event |
| AC-7 trial | ✅ | 30-day row on first sign-in, expiry, no query with billing off |
| AC-8 cancellation | ✅ | Paddle called with `next_billing_period`, row and request stored; Paddle errors shown without details; trial case |
| AC-9 legal pages | ✅ | `tests/legal/pages.test.ts`; build shows `/impressum`, `/datenschutz`, `/agb` as static |
| AC-10 Art. 9 consent | ✅ | `tests/legal/consent.test.ts` (5 intake paths answer 403; grant and version; revoke; cron skip; self-host) |
| AC-11 export | ✅ | `tests/account/data.test.ts` |
| AC-12 deletion | ✅ | same file: every schema table with `user_id`, Paddle and Clerk, Clerk webhook signature |
| AC-13 no regression | ✅ | tsc clean; vitest **58 files / 513 passed + 1 todo** (main after the follow-ups: 51 / 430 + 1, so 83 new); `next build` with an empty env OK; `scripts/snapshot-plan.mts` byte-identical to `main` (7,662,683 bytes) |

## Deviations from the plan

- The cancellation page is `/kuendigen` (public), not `/settings/kuendigen`, because §312k BGB wants it reachable
  without a login. Requests without a login are matched by the account email at Clerk. The answer never says whether
  an account exists.
- Also gated: going live with an own-method template, not only saving one. Saving "Mein Ansatz" (tuning) stays in
  Basic.
- No new dependencies. `vitest.config.mts` now compiles JSX (oxc) for the page test.

## Env vars (new)

`BILLING_ENABLED`, `REQUIRE_HEALTH_CONSENT`, `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_{BASIC,PLUS}_{MONTH,YEAR}`, `CLERK_WEBHOOK_SECRET`. All are in
`.env.example` and the README table.

## For Livius to fill / decide

1. Placeholders (`grep -rn "<Ph>" "app/(legal)"`):
   - name or firm, address, email and a second contact;
   - USt-IdNr or the §19 note, register entry, §18 MStV, §36 VSBG, repo link;
   - DPA dates and transfer basis for Vercel, Neon and Clerk;
   - log and backup retention, supervisory authority;
   - prices, domain, Paddle withdrawal flow, liability clause.
2. **Yearly plan renewal:** under §309 Nr. 9 BGB, after the first year a consumer contract may only continue month to
   month, but Paddle renews yearly. This needs a rule (pro-rata refund) and legal review.
3. **§312k confirmation in text form (email):** the confirmation is shown on screen; Runmate sends no email. Check
   whether Paddle's cancellation email is enough, otherwise add a mailer.
4. Plus price (10 €/99 € assumed in `lib/billing/config.ts` PRICE_LABEL) and the feature split.
5. Buying during the trial ends the trial; the remaining days are not carried over. OK?
6. Expired accounts: keep them read-only forever, or delete them after N months without activity?
7. A Paddle event that arrives after an account deletion recreates a bare subscription row (no other data). Accept
   that, or add a tombstone?
