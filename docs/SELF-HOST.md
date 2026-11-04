# Self-hosting Runmate

Two ways to run your own instance:

- **[Docker Compose](#docker-compose)**: Postgres, the app and the daily sync on one machine (a home server, a VPS).
- **[Neon + Vercel](#neon--vercel)**: serverless, nothing to maintain.

Both need a free [Clerk](https://clerk.com) application for sign-in. Self-hosting needs no billing setup: without
`BILLING_ENABLED` every feature is on and nothing is sold.

## Clerk (both ways)

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com). Pick email (and optionally Google) as
   the sign-in method.
2. Copy the **publishable key** (`pk_…`) and the **secret key** (`sk_…`).
3. To limit who can sign in, set `ALLOWED_EMAILS=you@example.com,partner@example.com`. Add the email to the session
   token so the check is free: Clerk Dashboard → Sessions → Customize session token →
   `{ "email": "{{user.primary_email_address}}" }`. Without the claim Runmate looks the address up at Clerk.
4. Optional: a webhook endpoint `https://<your host>/api/webhooks/clerk` for `user.deleted` (deletes that user's data);
   put its signing secret into `CLERK_WEBHOOK_SECRET`.
5. For a production instance on your own domain, create a Clerk **production** instance and add the DNS records Clerk
   shows; development keys work on `localhost`.

## Docker Compose

Requirements: Docker with Compose v2, about 2 GB of free memory for the build.

```bash
git clone https://github.com/livius33/runmate.git && cd runmate
cp .env.example .env
```

Fill in `.env`:

| Name | Value |
|---|---|
| `POSTGRES_PASSWORD` | A long random password, **letters and digits only** (it goes into a URL): `openssl rand -hex 24` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | From Clerk |
| `ALLOWED_EMAILS` | Who may sign in (recommended) |
| `ENCRYPTION_KEY` | `openssl rand -base64 32`; encrypts stored Garmin logins. Keep it: a new key makes them unreadable |
| `CRON_SECRET` | `openssl rand -hex 24`; protects the daily sync route |
| `PORT` | Host port, default `3000` |

Leave `DATABASE_URL` empty: Compose builds it from `POSTGRES_PASSWORD`. Then:

```bash
docker compose up -d --build
```

- `db`: Postgres 17 with the volume `pgdata`.
- `migrate`: applies the SQL in `drizzle/` that is not applied yet, then exits. It runs on every `up`, so updates
  migrate themselves.
- `app`: Runmate on `http://localhost:3000`. Sign in, then follow the onboarding (profile, data source, first plan).
- `cron`: calls `/api/cron/daily-sync` at 06:00 UTC, which fetches new Garmin activities for every user with a
  connected Garmin login.

Put a reverse proxy with TLS in front (Caddy, Traefik, nginx) before exposing it to the internet, and set
`APP_HOST=runmate.example.com` so calendar and Apple Health links use your public host.

### Update

```bash
git pull
docker compose up -d --build
```

### Backup and restore

```bash
docker compose exec db pg_dump -U runmate -Fc runmate > runmate-$(date +%F).dump
# restore into an empty database:
docker compose exec -T db pg_restore -U runmate -d runmate --clean --if-exists < runmate-2026-11-04.dump
```

Keep `.env` with the backup: without the same `ENCRYPTION_KEY`, stored Garmin logins have to be entered again.

### Other Postgres servers

Any Postgres 15+ works. Set `DATABASE_URL` and run the app container on its own. Runmate picks the driver from the URL:
`*.neon.tech` uses Neon's HTTP driver, everything else node-postgres; `DATABASE_DRIVER=neon|pg` overrides that.

## Neon + Vercel

Requirements: Node.js 22, a [Neon](https://neon.tech) project, a [Vercel](https://vercel.com) account.

```bash
git clone https://github.com/livius33/runmate.git && cd runmate
npm ci
cp .env.example .env.local        # DATABASE_URL, Clerk keys, ENCRYPTION_KEY, CRON_SECRET
npm run db:migrate                # applies drizzle/*.sql to DATABASE_URL
npm run dev                       # http://localhost:3001
```

1. **Neon:** create a project (EU region recommended, e.g. `aws-eu-central-1`) and copy the pooled connection string
   into `DATABASE_URL`.
2. **Vercel:** import your fork, add the same environment variables, deploy. `vercel.json` schedules the daily sync;
   Vercel sends `CRON_SECRET` with it.
3. After an update with new files in `drizzle/`, run `npm run db:migrate` against the production `DATABASE_URL`.

## Data sources

Each user connects their own sources under **Settings → Datenquellen**: the Garmin login (unofficial, experimental, no
MFA), the Apple Health shortcut, or file import (FIT/GPX/TCX/Garmin export ZIP). See the README's
[Data sources](../README.md#data-sources). You are responsible for using each source within its terms.

## Troubleshooting

- **Every page throws about a missing publishable key:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is read at build time;
  rebuild with `docker compose up -d --build` after setting it.
- **`migrate` fails with "password authentication failed":** the volume was created with another `POSTGRES_PASSWORD`.
  Use the old password, or drop the volume (`docker compose down -v`, deletes all data).
- **The build is killed:** give Docker more memory (Docker Desktop settings, or `colima start --memory 4`).
