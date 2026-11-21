# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(<https://github.com/livius33/runmate/security/advisories/new>).

Include what you found, how to reproduce it and which version or commit you tested. I aim to answer within
a week. Once a fix is released the advisory is published and you are credited, unless you prefer not to be.

## Scope

- The code in this repository, on the `main` branch.
- The hosted instance at runmate.dev, once it is live. Please test with your own account only: no access to other
  people's data, no denial-of-service tests, no automated scanning that degrades the service.

Out of scope: vulnerabilities in third-party services Runmate uses (Clerk, Paddle, Neon, Vercel, Garmin). Report
those to the vendor.

## What Runmate stores

Training data is health-related personal data. Garmin credentials and sessions are encrypted at rest with
`ENCRYPTION_KEY`; payment data never reaches the app (Paddle handles it). If you self-host, keep `.env` out of
version control and rotate `ENCRYPTION_KEY`, `CRON_SECRET` and the webhook secrets if they may have leaked.

## Checks in this repository

Every push runs a secret scan over the full history (gitleaks) in CI. GitHub secret scanning with push protection
and Dependabot alerts are enabled.
