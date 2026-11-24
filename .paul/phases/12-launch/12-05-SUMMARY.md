---
phase: 12-launch
plan: 05
completed: 2026-11-21
description: "Billing hardening before stage B: cancellation form, second subscription, deletion, daily reconcile, concurrency"
type: Summary
about: "Runmate"
---


# Phase 12 Plan 05: Billing hardening before stage B Summary

**Thirteen commits on `fix/billing-hardening`, pull request #9 against `main`. Five migrations (0006 to 0010), no new
dependency. Stage B stays off. Type check, 1018 tests and the build are green. AC-8 is not built: it needs a decision.**

| AC | Result |
|----|--------|
| 1 Cancellation form | 24-hour cooldown, take-back in the settings, requests after a take-back are held for the owner; identical HTTP answer in every case |
| 2 Checkout guard | The server signs no checkout while a subscription is live or one was started in the last 15 minutes; the buttons follow |
| 3 Second subscription | Never replaces the stored live one; kept in `otherSubscriptionIds`, logged with both ids, cancelled by "cancel" and by account deletion |
| 4 Deletion | Paddle cancel is retried; ids that still run are kept with the tombstone and cancelled by the reconcile job |
| 5 `billingReady()` | Checkout only with price ids, client token, API key, webhook secret and `PADDLE_ENV` of `sandbox` or `production`; one log line otherwise |
| 6 Reconcile | `unknown-user` at error level; daily job `/api/cron/billing-reconcile` (`30 5 * * *`) |
| 7 Concurrency | Compare-and-set for the subscription row, the form state and the go-live of a draft |
| 8 Trial after re-sign-up | **Not built.** The tombstone holds the user id only; telling a returning address needs a hash kept past the deletion. Reported, as the AC asks |
| 9 Green | tsc, vitest (114 files), build |

## After the review

An independent review of the first six commits found no blocker and ten points; all are fixed, each with a test:

- A subscription bought during or after an account deletion goes onto the tombstone and is cancelled by the reconcile
  job. The tombstone is written before the data is deleted, and a repeated deletion merges the ids.
- The form gives its 24-hour slot back whenever Paddle did not confirm, also when the call throws.
- Stale events are judged per subscription id (`other_subscription_seen`); a delayed "created" for a new subscription
  is no longer dropped because the old one's cancel came first, and a late "active" does not bring an ended one back.
- A cancel that Paddle refuses because the subscription already ended counts as done (the state is fetched).
- The reconcile job handles tombstones first and resumes from a cursor (`job_state`) when its time budget runs out.
- Take-back and the owner's decision on held requests no longer overwrite a request held at the same moment.
- The form's error log carries the error name and status only: a Clerk error can echo the address.
- A cancelled Plus without a known period end reads "endet mit dem bezahlten Zeitraum" and no longer shows an empty date.

## Deliberately unchanged

- The checkout signature is deterministic. The 15-minute lock is an aid for the interface; the backstop is the
  second-subscription handling.
- When the stored subscription ends while a second one runs, the account is Free until the next event or the nightly
  reconcile.

**Verified beyond the tests:** the three array statements on the tombstone (merge, append once, remove one by one)
on a local Postgres, 15 cases.

**Not verified:** any real Paddle call, sandbox included; Paddle's answer to cancelling an ended subscription is
assumed, the code does not depend on the error code. The migrations against a database with data. The cron on Vercel.
The settings card in a browser.

**Open for Livius:** AC-8 (accept the trial restart, or keep a hash of the address). Held requests: a cancellation
through the form after a take-back takes effect only when the owner confirms it; whether that satisfies § 312k BGB
should be settled before stage B.

**Left for later:** the reconcile cron checks its secret itself; it moves to `lib/server/cron-auth.ts` (12-04) in 12-06.
