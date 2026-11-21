# Deployment: runmate.dev from this repo

The hosted instance gets its own Vercel project, its own database and its own Clerk instance. Nothing is shared with
any other project. Steps that need a secret are done by the owner in the provider's dashboard; no secret goes into
this repo, a chat or an issue.

## Two stages

**Stage A — live without billing.** `BILLING_ENABLED` unset: every account has every feature, no prices are shown
in the app. Set `REQUIRE_HEALTH_CONSENT=1` (the Art. 9 consent is asked anyway) and, while the circle is small,
`ALLOWED_EMAILS`. The landing page's button is the waitlist until billing is on; people you invite sign up at
`/sign-in`. Needs: steps 1–5, Impressum and Datenschutz filled, **and a decision on the waitlist** (step 8): today it
promises a confirmation mail that nobody sends.

**Stage B — Free + Plus.** `BILLING_ENABLED=1` once the business is registered, Paddle has verified the account
and the AGB are filled. Needs: step 6 and the remaining legal placeholders. Existing accounts start their 30 days
of Plus on that day.

## 1 · Database

A Neon project in Frankfurt (`aws-eu-central-1`) for Runmate alone. With its connection string in `.env.local`:

```bash
npm run db:migrate
```

## 2 · Clerk

The production instance for `runmate.dev`:

- Social connections: enable Google and Apple with your own OAuth credentials (a production instance has none by
  default).
- Webhook endpoint `https://runmate.dev/api/webhooks/clerk`, event `user.deleted` → its signing secret is
  `CLERK_WEBHOOK_SECRET`.
- Paths: sign-in `/sign-in`.

## 3 · Vercel project

Import `livius33/runmate` as a new project (framework preset Next.js, Node.js 22 or later). `vercel.json` schedules
the daily sync at 06:00 UTC and, with billing on, the reconciliation with Paddle at 05:30 UTC
(`/api/cron/billing-reconcile`; without `BILLING_ENABLED` it does nothing). Environment variables, Production:

| Variable | Value | Stage |
|---|---|---|
| `DATABASE_URL` | Neon connection string (pooled) | A |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk production instance | A |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | A |
| `CLERK_WEBHOOK_SECRET` | from step 2 | A |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` — new, never reused from another project; losing it makes stored Garmin logins unreadable | A |
| `CRON_SECRET` | `openssl rand -hex 32` | A |
| `APP_HOST` | `runmate.dev` | A |
| `NEXT_PUBLIC_SITE_URL` | `https://runmate.dev` | A |
| `REQUIRE_HEALTH_CONSENT` | `1` | A (not needed in B) |
| `ALLOWED_EMAILS` | comma-separated, while the instance is invite-only; unset = anyone can sign up | A, optional |
| `NEXT_PUBLIC_REPO_URL` | `https://github.com/livius33/runmate` once the repo is public | with go-public |
| `NEXT_PUBLIC_VERCEL_ANALYTICS` | `1` for cookieless analytics on the marketing pages | optional |
| `BILLING_ENABLED` | `1` | B |
| `PADDLE_ENV` | exactly `sandbox` first, then exactly `production`; any other value keeps the checkout off | B |
| `PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle → Developer tools → Authentication | B |
| `PADDLE_WEBHOOK_SECRET` | from step 6. Also signs the user id a checkout carries: without it no checkout is attached to an account | B |
| `PADDLE_PRICE_PLUS_MONTH`, `PADDLE_PRICE_PLUS_YEAR` | price ids from step 6 | B |

`DEMO_MODE` stays unset on this instance. `NEXT_PUBLIC_*` values are read at build time: redeploy after changing one.
With `BILLING_ENABLED=1` the checkout is offered only when `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` and at least one price id are set; otherwise the function log shows one line at
start-up, `[billing] BILLING_ENABLED is set but checkout stays off: missing or invalid …`.

## 4 · Domain

Remove `runmate.dev` (and `www`) from the project that serves it today, add both to the new project, pick one as the
primary and redirect the other. DNS stays as it is when both projects are in the same Vercel account. Update the Clerk
production instance if its domain settings name the old deployment.

## 5 · Smoke test (10 minutes)

1. `https://runmate.dev/` shows the landing page in German, `/en` in English; `/impressum`, `/datenschutz` without
   placeholders.
2. Sign up with a new address → consent → profile → skip the data source → "Erstmal ohne Ziel" → the plan page shows
   base weeks from next Monday.
3. Settings → import one FIT or GPX file → the run appears under Läufe.
4. Settings → Meine Daten → export downloads a ZIP; delete the test account with the typed phrase.
5. Vercel → Cron Jobs → run `/api/cron/daily-sync` once: 200.
6. Stage B only, with `PADDLE_ENV=sandbox` (about 15 minutes, one fresh test account):
   1. Signed out, the landing page's button leads to sign-up; sign up with a new address.
   2. Settings → Abo → Plus monthly → pay with a Paddle test card. Within seconds the card shows Plus; the Paddle
      dashboard shows the webhook delivered (200, `applied`). The buy buttons are gone.
   3. A second tab with Settings → Abo open from before the purchase: clicking Plus answers "Du hast schon ein laufendes
      Abo" (no second checkout opens).
   4. Sign out, open `/kuendigen`, cancel with the account's name and e-mail. The confirmation looks the same as for an
      unknown address. The function log has `[billing/cancel-request] user=… subscription=sub_… outcome=cancel`.
   5. Sign in again: Settings → Abo says "Dein Plus endet am …" and that the cancellation came through the form;
      Paddle shows the subscription with a scheduled cancellation.
   6. "Kündigung zurücknehmen" → the card shows "Verlängert sich am …" again; Paddle shows no scheduled change.
   7. A day later (the form takes one request per account and 24 hours), cancel through `/kuendigen` again: nothing
      changes at Paddle, Settings → Abo shows the held request with "Kündigung bestätigen" and "Verwerfen". Confirm →
      Paddle schedules the cancellation.
   8. Vercel → Cron Jobs → run `/api/cron/billing-reconcile` once: 200 with `"complete": true` and `"failed": 0`.
   9. Delete the test account (Settings → Meine Daten); Paddle shows the subscription cancelled at once.

## 6 · Paddle (stage B)

- Product "Runmate Plus" with two prices: 9 € per month, 79 € per year, tax-inclusive, EUR. No trial in Paddle: the
  30 days run in the app, without a card.
- Notification destination `https://runmate.dev/api/billing/webhook` with the `subscription.*` and
  `transaction.completed` events → its secret is `PADDLE_WEBHOOK_SECRET`.
- Default payment link / approved domain: `runmate.dev`.
- Confirm with Paddle that their cancellation email counts as the confirmation § 312k BGB asks for; the public
  cancellation form is `/kuendigen`.

## 7 · Legal pages

`grep -rn "<Ph>" "app/(legal)"` lists what is open (28 places): name and address that can receive legal service,
e-mail and a second fast contact, supervisory authority, the data-processing agreements (Vercel, Neon, Clerk, Paddle)
with their transfer basis, Neon's backup retention, the prices in the AGB, the liability clause (have it checked), the
§ 36 VSBG decision, withdrawal and refunds through Paddle. Stage A needs Impressum and Datenschutz; stage B the AGB too.

## 8 · Not wired yet

- **Waitlist mail.** `lib/waitlist/index.ts` → `pendingMailer` sends nothing in production, while the page says "Wir
  haben dir einen Bestätigungslink geschickt". Before the landing page is public either a mail provider (EU) is wired
  as `WaitlistMailer`, or sign-up opens without billing (`signUpOpen()` in `lib/marketing/site.ts`, with a note that
  fits a version without prices). Until then keep the landing page off the public domain or go straight to stage B.
- Retention of idle Free accounts (reminder after 12 months, deletion 30 days later) needs a mailer; until one exists
  the cron is not scheduled and nothing is deleted (`README.md` → Retention).
- **Cancellation mail.** A request through `/kuendigen` is not yet confirmed by e-mail to the account's address
  (`sendCancellationMail` in `lib/billing/cancel-form.ts` sends nothing until a mail provider is wired, 12-07). Until
  then the owner sees every form request in Settings → Abo and can take it back there.
- The official Garmin API. The Garmin login in the app is the unofficial one and is labelled experimental.

Going public with the repository and the announcements: `docs/launch/ANNOUNCE.md`.
