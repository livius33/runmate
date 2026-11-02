# Phase 4 · Billing + legal — plan

Branch `phase-4-billing-legal` (from `main`, local only). Builds on Phase 2 (per-user scope, `withUser` / `runAsUser`,
`own` / `mine`) and Phase 3 (sources, Garmin consent text).

## Objective

The hosted app can charge for itself and is legally presentable in Germany, while a self-hosted install keeps every
feature with no billing at all:

1. **Entitlements** — one pure module decides what a user may do from their plan state (self-host / trial / basic /
   plus / past_due / expired). Plus features are checked on the server and gated in the UI with a calm German upsell.
   Data export and account deletion are never gated.
2. **Paddle Billing** (merchant of record) — checkout with Paddle.js, a verified and idempotent webhook that keeps a
   `subscription` row per user, a 30-day trial without a card from the first sign-in, the customer portal and the
   §312k BGB cancellation button.
3. **Legal pages** — Impressum (§5 DDG), Datenschutzerklärung (Art. 13 GDPR), AGB with withdrawal right and model
   withdrawal form: German templates with `[PLATZHALTER: …]`, public, no Clerk JS. A "kein Medizinprodukt" disclaimer.
4. **Art. 9 consent** for health data, separate and explicit, before the first source is connected or a file imported;
   versioned, revocable.
5. **Own data** — export everything as a ZIP (Art. 20), delete the account everywhere (Art. 17), also triggered by
   Clerk's `user.deleted` webhook.

Product decisions (Livius, LAUNCH-PLAN.md): Basic 6 €/month or 59 €/year = sync, analysis, insights, one generated
plan. Plus ~10 €/month or ~99 €/year = adaptive engine (auto moves, fatigue guard, rebalance), several plans/races, own
method, race-day tools. 30-day trial without a card. Billing is off unless `BILLING_ENABLED` is set.

## Design

### Entitlements (`lib/billing/entitlements.ts`, pure)

- `PlanState = 'self-host' | 'trial' | 'basic' | 'plus' | 'past_due' | 'expired'`.
- `planState(sub, now, billingEnabled)`: no billing → `self-host`; Paddle `active`/`trialing` → tier; Paddle
  `past_due` → `past_due` (keeps its tier during Paddle's dunning, with a notice); app trial running and no paid
  subscription → `trial`; everything else (trial over, `canceled`, `paused`) → `expired`.
- `entitlements(state, tier)` → `{ state, tier, features: Record<Feature, boolean>, maxLivePlans, notice }`.
  Features: `sync`, `plan`, `autoAdapt`, `multiPlan`, `ownMethod`, `raceDay`, `export`, `delete`.
  - self-host, trial, plus: everything; `maxLivePlans = ∞`.
  - basic: `sync`, `plan`, `export`, `delete`; one live generated plan.
  - past_due: the features of its tier.
  - expired: `export`, `delete` only — existing data stays readable, nothing new comes in, no new plan.
- Server: `lib/billing/access.ts` — `currentEntitlements()` (per request, cached in the scope) and
  `requireFeature(f)` → a 402 German JSON response or `null`.
- Gated server paths: engine auto-apply (`runAndSaveEngine`), going live with a second plan (`goLive`), saving the own
  method (`saveOwn`), race-day tools (`/api/running/race-analysis`, race checklist writes), sync / import / Apple
  Health push (`sync`). The cron skips users without `sync`.
- **Engine for non-Plus:** the pure engine is unchanged. The store runs it, does **not** save, and returns the would-be
  changes as `suggestions`; the Plan page lists them with an "Übernehmen" button (manual apply of exactly that change)
  and the upsell. Existing saved engine changes stay.
- UI: `useEntitlements()` from the dashboard layout (no extra request); `<PlusGate>` / `<Upsell>` with a calm text.

### Billing (`lib/billing/`)

- Tables (migration `0002_billing_legal`): `subscription` (one row per user: `status`, `tier`, `interval`,
  `trial_ends_at`, `paddle_customer_id`, `paddle_subscription_id`, `price_id`, `current_period_end`,
  `cancel_at_period_end`, `canceled_at`, `event_at`), `billing_events` (Paddle `event_id` PK + `user_id`, type, time —
  idempotency), `consents` (`user_id`, `kind`, `version`, `granted_at`, `revoked_at`).
- `paddle.ts`: config from env (`PADDLE_ENV` sandbox|production, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, price ids
  `PADDLE_PRICE_{BASIC,PLUS}_{MONTH,YEAR}`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`), `verifyPaddleSignature(raw, header,
  secret, now)` (`ts=…;h1=…`, HMAC-SHA256 over `ts:body`, constant-time, 5 min tolerance), API calls with `fetch`
  (cancel at period end / immediately, portal session).
- `webhook.ts`: pure `applyPaddleEvent(row, event)` → next row (state transitions), store `handlePaddleEvent(event)`:
  insert into `billing_events` on conflict do nothing (duplicate → 200, no change), user from `custom_data.userId`
  (or the stored subscription/customer id), stale events (`occurred_at` older than `event_at`) ignored. Handles
  `subscription.created/updated/activated/canceled/past_due/paused/resumed`, `transaction.completed`.
- Trial: `ensureSubscription()` in the dashboard layout creates the row with `trial_ends_at = now + 30 d` on first
  sign-in (billing on only).
- Routes: `POST /api/billing/webhook` (public in middleware), `GET /api/billing` (status, prices, client token),
  `POST /api/billing/portal`, `POST /api/billing/cancel`.
- Settings → **Abo**: status, trial end / renewal date, checkout buttons (Paddle.js loaded on demand), portal link and
  **"Verträge hier kündigen"** → `/settings/kuendigen` (what is cancelled, when it ends) → **"Jetzt kündigen"** →
  Paddle cancel at period end → confirmation text with the end date (§312k BGB).

### Legal (`app/(legal)/`)

- `/impressum`, `/datenschutz`, `/agb`: server pages in their own route group; `ClerkProvider` moves from the root
  layout into the dashboard and sign-in layouts, so these pages load no Clerk JS; middleware lets them through.
- Each page: banner "Vorlage – vor dem Livegang juristisch prüfen"; placeholders as `[PLATZHALTER: …]`, never invented
  personal data. Datenschutz: controller, purposes and legal bases (Art. 6(1)(b), Art. 9(2)(a) for HR, HRV, sleep,
  weight), processors Vercel, Neon (Frankfurt), Clerk (auth data only), Paddle (merchant of record), Garmin / Apple
  Health / files as user-initiated sources, retention, rights, complaint authority. AGB: subscription, trial,
  renewal, 14-day withdrawal right with Muster-Widerrufsformular, cancellation.
- `components/legal/Disclaimer.tsx` ("Runmate ist ein Trainings- und Freizeitwerkzeug … kein Medizinprodukt …"),
  shown on the legal pages, the sign-in page and Settings; a footer with the three links.

### Art. 9 consent (`lib/legal/consent.ts`)

- `HEALTH_CONSENT = { version, text[] }`; required on hosted instances (`BILLING_ENABLED`, or
  `REQUIRE_HEALTH_CONSENT=1`); self-hosters process their own data and are not asked.
- `hasHealthConsent()`, `grantHealthConsent(version)`, `revokeHealthConsent()`; `requireHealthConsent()` → 403 German
  JSON with `code: 'consent-required'`. Checked on source connect, sync, file import, Health link creation and the
  Apple Health push; the cron skips users without it.
- Settings → **Gesundheitsdaten**: the text, checkbox, grant; when granted: date + version, "Einwilligung widerrufen"
  → stops processing, offers "Gesundheits- und Aktivitätsdaten löschen".
- Garmin consent text reviewed (no change in meaning; health-data consent referenced).

### Own data (`lib/account/`)

- `userTables()` — every table of the schema with `user_id`, children before parents.
- `exportUserData()` → ZIP (fflate, already a dependency): `<table>.json` per table, secrets left out
  (`garmin_accounts.*_enc`), `README.txt`. No original files are stored (imports keep parsed rows only).
- `deleteUserData()` deletes the user's rows in every user table (one function); `deleteAccount()` = cancel Paddle
  immediately, delete rows, delete the Clerk user. `POST /api/account/delete` (confirmation phrase), `GET
  /api/account/export`.
- `POST /api/webhooks/clerk` (public): svix signature (`svix-id`, `svix-timestamp`, `svix-signature`, secret
  `CLERK_WEBHOOK_SECRET`), `user.deleted` → `runAsUser(id, deleteUserData)` plus Paddle cancel.

## Acceptance criteria

- **AC-1 entitlements.** Given each plan state, when `entitlements()` runs, then the feature map matches the table above
  (self-host/trial/plus all, basic without the four Plus features, expired only export + delete) and export/delete are
  true in every state.
- **AC-2 server gating.** Given a Basic user, when they call a Plus route (own method, second live plan, race analysis,
  checklist write), then 402 with a German message and nothing is written; given Plus or self-host, then the route runs.
- **AC-3 engine suggestions.** Given a Basic user and an engine run that would change the plan, then nothing is saved
  and the changes come back as `suggestions`; accepting one applies exactly that change. The plan snapshot is
  byte-identical to `main`.
- **AC-4 signature.** Given a Paddle webhook, when the `Paddle-Signature` is missing, wrong, for another body or older
  than 5 min, then 401 and no DB write; when valid, then 200.
- **AC-5 idempotency.** Given the same event id twice, then the subscription is written once.
- **AC-6 transitions.** Given created → past_due → updated(active, scheduled cancel) → canceled, then the row and the
  plan state follow (plus → past_due → plus, ends at period end → expired); a stale event changes nothing.
- **AC-7 trial.** Given first sign-in with billing on, then a trial row with 30 days; given day 31 without a
  subscription, then `expired`; with billing off no row and `self-host`.
- **AC-8 cancellation button.** Given an active subscription, Settings shows "Verträge hier kündigen" → confirmation
  page → "Jetzt kündigen" calls Paddle cancel with `effective_from: next_billing_period` and shows the end date.
- **AC-9 legal pages.** Given no session, /impressum, /datenschutz, /agb render (public in middleware, no Clerk
  provider), each with the review banner and `[PLATZHALTER: …]` instead of personal data.
- **AC-10 Art. 9 consent.** Given a hosted instance and no consent, connect / import / sync / health push are refused with
  `consent-required`; after granting, they run; consent is stored with time and version; revoking blocks again.
- **AC-11 export.** Given a user, the ZIP holds one JSON file per user table, only that user's rows, no secrets.
- **AC-12 deletion.** Given a user, `deleteUserData()` issues a DELETE filtered by that user for every table with
  `user_id` in the schema (test enumerates the schema); account deletion also cancels Paddle and deletes the Clerk
  user; a valid Clerk `user.deleted` webhook triggers it, an invalid signature does not.
- **AC-13 no regression.** tsc clean, vitest green, `next build` without DB/Paddle env, snapshot identical.

## Tasks

1. Plan (this file).
2. Entitlements module + server checks + engine suggestions + UI gating.
3. Schema + migration, Paddle config/signature/API, webhook, trial, billing routes, Settings → Abo, cancellation page.
4. Legal pages, route group, ClerkProvider move, disclaimer, footer.
5. Health consent (store, checks, Settings card), Garmin text review.
6. Export, deletion, Clerk webhook, Settings → Meine Daten.
7. Tests for each; env vars in `.env.example` and README; SUMMARY.md.

## Boundaries

- No new dependencies (Paddle and svix via `fetch` + `node:crypto`; ZIP via fflate).
- Plan logic (`lib/plan/engine.ts`, generator, effective) unchanged; snapshot byte-identical.
- No personal data; every name/address/contact a `[PLATZHALTER: …]`.
- Legal texts are templates, not legal advice; the banner says so.
- Migration generated with drizzle-kit, not run against a live DB. Nothing pushed.
