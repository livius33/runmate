# Phase 6 · Landing page — summary

Branch `phase-6-landing` (from `main`, merged as eff914f). Plan: [PLAN.md](PLAN.md).

Commits: `0a3c8c7` plan · `faef3a1` dashboard → `/plan`, public routes, React Query out of the root layout ·
`a967832` dark tokens, display font, motion CSS · `47c81fe` landing, pricing, methodology pages, SEO, waitlist ·
`5ec4b73` tests · `efa25cf` env vars.

## What shipped

**Routes (all prerendered, no Clerk, no React Query):**
- `/` (de) and `/en` (wrapped in `lang="en"`, because the root `<html>` stays `de`);
- `/preise` and `/en/pricing`;
- `/methoden`, plus `/methoden/<id>` for each of the 8 templates in `methodologies/*.md` (README, `own/` and `research/`
  are not templates and get no page);
- `/warteliste/<status>` and `/en/waitlist/<status>` (noindex);
- `sitemap.xml`, `robots.txt`, and an OG image per locale.

**Dashboard move.** The dashboard home is now `/plan`. Nav, the "← Plan" link, `planHref`, the manifest `start_url` and
the service worker's start page all point there. The middleware sends signed-in visits to `/` on to `/plan`.

**Middleware.** It also makes these public: `/en(.*)`, `/preise`, `/methoden(.*)`, `/warteliste(.*)`,
`/api/waitlist(.*)`, the SEO files, `/opengraph-image(.*)`, `/demo(.*)` and `/sign-up(.*)`.

**Real UI vs. mock:**
- *Real:* each methodology's sample week is produced by `generateDraft` for a fictional profile at build time. The
  method texts, sources and template values come from the Markdown files. The Porto course line is drawn from
  `examples/porto-2026/porto-marathon.gpx`.
- *Static mock:* the product panels (Today, week strip, plan changes, fatigue guard, pause, block progress, long-run
  and zone-2 lines, week review, race week, splits). They are built from the app's own `Card`, `Pill`, `TypeTag` and
  `Stat` with the fixture in `app/(marketing)/_sample/` and are labelled "Beispieldaten".
- The app UI inside the panels stays German on `/en`, and the page says so.

**Motion and theme.** Motion is CSS only: the week bars fill once on load, and plan changes slide in through
scroll-driven animation where supported. Both are off under `prefers-reduced-motion`. The dark tokens apply under
`.dark` or `.theme-auto` (the marketing layout); the app's `:root` is unchanged. The dark teal (`174 64% 40%`) was
chosen with the dataviz palette validator.

**Waitlist.** Table `waitlist` lives in `lib/db/public-schema.ts`, because it has no user and so is not in
`schema.ts`. Migration `drizzle/0003_waitlist.sql`; drizzle-kit reads both schema files.
- The form is plain HTML: a POST answered with a 303 redirect.
- Email validation plus a honeypot field.
- Only the SHA-256 of the 32-byte token is stored.
- The confirm link expires after 7 days. Unconfirmed entries are purged on the next sign-up.
- The leave link deletes the entry.
- A repeat sign-up never reveals whether the address is already on the list.
- Mail sending is `pendingMailer`, a TODO that prints the link in dev only.
- With `BILLING_ENABLED`, every CTA links to `/sign-up` instead.

**SEO and analytics:**
- Metadata per locale, a canonical URL, and hreflang de/en + `x-default` → de.
- JSON-LD `SoftwareApplication` (SportsApplication) with offers 0 / 6 / 10 EUR.
- `NEXT_PUBLIC_VERCEL_ANALYTICS=1` loads the cookieless `/_vercel/insights/script.js` (no package). Clicks on
  `data-track` elements are sent as events: CTA, waitlist, pricing toggle, method tab, GitHub.
- New env vars `NEXT_PUBLIC_SITE_URL` (default `https://runmate.dev`), `NEXT_PUBLIC_REPO_URL` (GitHub links only when
  set) and `NEXT_PUBLIC_VERCEL_ANALYTICS` are in `.env.example` and the README.

**Interaction without JS.** The pricing toggle and method tabs are radio inputs with `:has()`; the FAQ uses
`<details>`.

## Sizes (`next build`, empty env)

| Route | Page JS | First Load JS |
|---|---|---|
| `/`, `/en`, `/preise`, `/en/pricing`, `/methoden`, `/methoden/[id]`, waitlist pages | 194 B | 107 kB |

- Shared framework chunks: 103 kB.
- On the landing page, the gzip JS loaded by modern browsers is about 107 kB: React/Next ≈ 101 kB, `next/link`
  3.4 kB, the page 0.2 kB.
- **The plan's 80 kB budget is not reachable** with the App Router baseline (103 kB shared on every route); the
  page's own JS is effectively zero.
- HTML of `/` is 300 kB raw / 38 kB gzip (it includes the inline RSC payload and all 8 method panels).
- No raster images, so the LCP element is text. The fonts come from `next/font` (Latin), with `display: swap` and
  metric-matched fallbacks.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC-1 /plan | ✅ | `tests/marketing/landing.test.ts` (file moved, nav/manifest/SW, middleware redirect) |
| AC-2 public | ✅ | same test (middleware patterns, no `@clerk` / `@tanstack` / `'use client'` in `app/(marketing)`); curl: all pages 200 with no session |
| AC-3 static | ✅ | build: every marketing route `○`/`●`; empty-env build OK |
| AC-4 content | ✅ | landing test (all sections, disclaimer, legal links); `i18n.test.ts` honesty checks |
| AC-5 i18n | ✅ | `i18n.test.ts` key parity at every depth (tsc checks the shape too) |
| AC-6 methodologies | ✅ | `methods.test.ts` (params = valid templates, generator week, page content, Markdown safety) |
| AC-7 SEO | ✅ | `sitemap.test.ts`; curl showed canonical, hreflang, og:image (200, PNG) |
| AC-8 waitlist | ✅ | `waitlist.test.ts` (validation, hash only, expiry, idempotent confirm, leave, no leak, honeypot, routes without DB → 303 error page) |
| AC-9 analytics | ✅ | landing test (script only with the flag) |
| AC-10 dark | ✅ | landing test (`:root` unchanged, scoped dark sets); dark and light screenshots checked |
| AC-11 no regression | ✅ | tsc clean; vitest **63 files / 549 passed + 1 todo** (36 new); `snapshot-plan.mts` byte-identical to `main` (7,662,683 bytes) |

Coordinator check 2026-11-02: tsc, vitest (549), empty-env build and snapshot re-run on the branch; `/en` and `/preise`
viewed in the browser on a local dev server (no console errors).

## Deviations

- React Query (`Providers`) moved from the root layout into the dashboard layout, so the marketing pages ship no
  query client. Phase 5 was told: a `/demo` layout outside `(dashboard)` must wrap itself in `<Providers>`.
- The method pages exist in German only, since the template texts are German. `/en` links to them, marked "(German)".
- `/kuendigen` and the waitlist pages are disallowed in robots (not meant for search).
- Local `next start` needs Clerk keys: the middleware throws without a publishable key, as on `main`. Screenshots were
  taken from the prerendered HTML.

## For Livius

1. **Copy:**
   - the "built for Porto" paragraph (after 8.11., add the real result if you like; no target time is shown now);
   - the FAQ wording on the Garmin login;
   - the English texts.
2. **Assets:** a logo lockup (the app icon is used for now), real screenshots or the demo seed (Phase 5) if you prefer
   them over the panels, and the repo URL (`NEXT_PUBLIC_REPO_URL`) once the repo is public.
3. **Mail provider** for the waitlist (EU), which means implementing `WaitlistMailer`. Mention the waitlist in the
   Datenschutzerklärung (purpose, storage, 7-day deletion).
4. **Decisions:**
   - the Basic/Plus split shown follows `lib/billing/entitlements.ts`;
   - "10 €/99 €" for Plus is still provisional;
   - whether `/sign-up` exists before billing goes live (Phase 5).
5. **Merge note:** Phase 5 may also add a migration `0003_*`. It merges second, so it renumbers its migration (and
   regenerates the drizzle snapshot).
