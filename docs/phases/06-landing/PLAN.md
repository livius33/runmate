# Phase 6 · Landing page — plan

Branch `phase-6-landing` (from `main`). Source plan: [docs/LANDING-PAGE.md](../../LANDING-PAGE.md); decisions in
[docs/LAUNCH-PLAN.md](../../LAUNCH-PLAN.md). Phase 5 (onboarding + demo) runs in parallel on its own branch.

## Goal

A static, honest marketing site in the same Next.js app: `/` (de) and `/en`, pricing, one indexable page per
methodology template, SEO plumbing and a waitlist with double opt-in, while the dashboard moves to `/plan`.

## Boundaries

- Owned here: `app/(marketing)/`, the move of the dashboard home to `/plan` (nav, links, manifest, service worker),
  `middleware.ts` public routes, `app/layout.tsx`, dark tokens in `app/globals.css`, `lib/i18n/`, `lib/marketing/`,
  `lib/waitlist/`, the `waitlist` table and its migration, `app/sitemap.ts`, `app/robots.ts`.
- Not touched: onboarding, `/demo/*`, billing logic, engine/generator logic (read only), legal page texts.
- No new dependencies. No Clerk JS, no cookies, no third-party requests on marketing pages.
- Honesty: Garmin access is an unofficial login marked experimental (official API planned); health data EU-hosted,
  exportable and deletable; "kein Medizinprodukt". No invented testimonials, user counts or star counts.

## Acceptance criteria

- **AC-1 dashboard at /plan.** Given a signed-in user, when they open `/`, then they are redirected to `/plan`, which
  shows the former home page; nav, the "← Plan" link, `planHref`, the manifest `start_url` and the service worker's
  start page point to `/plan`.
- **AC-2 public marketing.** Given no session, when `/`, `/en`, `/preise`, `/en/pricing`, `/methoden`, `/methoden/<id>`,
  `/warteliste/*`, `/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/demo/*` or `/sign-up` are requested, then the
  middleware lets them through; the marketing layout imports nothing from `@clerk`.
- **AC-3 static.** Given `next build` with an empty environment, then every marketing page is prerendered (`○`/`●`)
  and the build succeeds without a database.
- **AC-4 content.** Given the German page, then it has the sections hero, built in the open, how it works, methods,
  adaptive engine, insights, race day, pricing (self-host 0 € · Basic 6 €/59 € · Plus 10 €/99 € · 30 days without a
  card), FAQ, final CTA and footer; the FAQ states the Garmin login is unofficial and experimental, data is EU-hosted
  with export/deletion, and Runmate is no medical device.
- **AC-5 i18n.** Given `lib/i18n/de.ts` and `en.ts`, then both have exactly the same keys (type-checked and tested);
  `/en` renders the English dictionary with `lang="en"`.
- **AC-6 methodologies.** Given `methodologies/*.md`, then every valid template (not README, not `own/`, not
  `research/`) gets `/methoden/<id>` with its name, summary, rendered text and sources, and its sample week comes
  from the real generator (`generateDraft`) for a fictional runner.
- **AC-7 SEO.** Given each page, then it has a title/description per locale, a canonical URL, hreflang de/en +
  `x-default` (de) where a translation exists; `sitemap.ts` lists every public page incl. each methodology;
  `robots.ts` allows marketing and disallows the app and API; the OG image renders; the landing page carries
  JSON-LD `SoftwareApplication` with offers.
- **AC-8 waitlist.** Given billing is off, when someone submits an email, then it is validated (trimmed, lowercased,
  RFC-ish, ≤ 254 chars, honeypot), stored with a hashed confirm token (no plain token at rest), and a confirm mail
  is handed to a mailer interface (sending is a TODO); `GET /api/waitlist/confirm?token=` confirms once and expires
  after 7 days; `/api/waitlist/leave?token=` deletes the entry; re-submitting never reveals whether an email exists.
  Given `BILLING_ENABLED`, the CTAs link to `/sign-up` instead.
- **AC-9 analytics.** Given `NEXT_PUBLIC_VERCEL_ANALYTICS=1` at build, then the cookieless Vercel Web Analytics
  script loads and CTA / pricing toggle / GitHub clicks are sent as events; otherwise no script.
- **AC-10 dark mode.** Given `prefers-color-scheme: dark`, then the marketing pages use the dark token set; the app's
  light look is unchanged (no dark tokens apply outside `.theme-auto` or `.dark`).
- **AC-11 no regression.** `npx tsc --noEmit` clean, `npx vitest run` green, `scripts/snapshot-plan.mts` byte-identical
  to `main`.

## Tasks

1. Restructure: dashboard home → `app/(dashboard)/plan/page.tsx`, links, manifest, service worker, middleware public
   routes + signed-in redirect, Providers out of the root layout (marketing ships no React Query).
2. Dark tokens + display face (Inter Tight via `next/font`) + marketing type scale.
3. `lib/i18n` (de, en), `lib/marketing` (site URL, methodology catalogue + generated sample weeks, GPX motif, tiny
   Markdown renderer), `_sample/` fixture for the mock panels.
4. Sections and pages: `/`, `/en`, `/preise`, `/en/pricing`, `/methoden`, `/methoden/[slug]`.
5. Waitlist: table + migration `0003`, pure validation/token logic, API routes, status pages; BILLING_ENABLED CTA.
6. SEO: metadata, hreflang, sitemap, robots, OG images, JSON-LD; analytics hook.
7. Tests, build sizes, snapshot, SUMMARY.md.

## Visual direction (from the landing plan, made concrete)

- Tokens as in the app: cool grey page, white cards, red only for CTA and the one highlighted number, teal = run.
- Display: Inter Tight 600, tight tracking, big tabular figures; body Inter.
- One memorable element: the week strip (plan vs. run bars) — in the hero, filling once on load (CSS only,
  `prefers-reduced-motion` respected), and again in the final CTA. The Porto GPX line runs behind the hero.
- Left-aligned asymmetric 12-column grid, wide panels, no stacked narrow card columns, no all-caps eyebrows.
- Product visuals are the app's own primitives (`Card`, `Pill`, `TypeTag`, `Stat` from `components/plan/ui`) with
  static sample data, labelled as sample data.
