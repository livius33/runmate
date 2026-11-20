# Landing page plan: Runmate (runmate.dev)

Updated 2026-11-18 with the decisions: AGPL-3.0, Paddle, Free + Plus (9 €/month, 79 €/year), 30-day Plus trial without a card, Garmin (official API) + Apple Health first.

## 1. Positioning

- **DE:** „Dein Marathonplan, der mitdenkt – nach echten Methoden, mit Regeln, die du nachlesen kannst."
- **EN:** "A marathon plan that adapts to what you actually ran – built on real methodologies, with rules you can read."

**Three differentiators**

1. **Real methods, open rules, no black box.** Runna and Garmin Coach generate plans you can't see into. Runmate builds plans from Daniels, Pfitzinger, Hansons, Lydiard, 80/20, Norwegian or its own method, and every engine change shows the rule behind it (the existing "Plan-Anpassungen" card already says "automatisch, nach festen Regeln").
2. **It adapts, and it doesn't just analyse.** intervals.icu and TrainingPeaks show CTL, ATL and TSB but leave the plan to you. Runmate acts on them: missed key sessions get moved, a fatigue guard (TSB/ACWR) kicks in, sickness or a pause leads to a graded return, and unrun km are redistributed under a daily cap.
3. **Open source and yours.** You can self-host for free with Garmin data, or use the hosted version for a few euros. Your data stays exportable, and it is German first and GDPR-native.

## 2. Page structure

| # | Section | German headline draft | Real UI to show |
|---|---|---|---|
| 1 | Hero | „Lauf nach Plan. Der Plan läuft mit." Sub: „Trainingspläne nach Daniels, Pfitzinger & Co., die sich an deine echten Läufe anpassen." CTAs: *30 Tage testen* · *Auf GitHub ansehen* | `TodayCard` next to the `TrainingSchedule` week strip (plan vs. actual), shown as a framed screenshot that slightly overlaps a second layer |
| 2 | Built in the open | „Gebaut im Training für Porto 2026 – öffentlich auf GitHub." Small facts: one HR model, rules count, AGPL-3.0 licence, GitHub stars | Small `CourseMap` line plus a real "Porto 3:05" result once the race is done (8.11.) |
| 3 | How it works | „In drei Schritten zum Plan": Garmin verbinden → Methode & Ziel wählen → täglich wissen, was ansteht | `Onboarding` (workshop) steps as three cropped tiles |
| 4 | Methods | „Sieben Methoden. Keine Blackbox." Tabs per method: one sentence, weekly structure, source | Generated week of each method (`NextPlan` / week strip), with a link to `methodologies/*.md` on GitHub |
| 5 | Adaptive engine | „Verpasst? Krank? Müde? Der Plan reagiert – und sagt dir warum." | `PlanChanges` log (before → after, rule, undo), `PauseControl`, the fatigue-guard notice |
| 6 | Insights | „Sieh, ob dein Block wirkt." | `ProgressSection` panels (Blockfortschritt, Longrun-Aufbau, Tempo in Zone 2, Renntempo-Blöcke), `WeekReview`, `LoadBySport` |
| 7 | Race week & race day | „Bis zur Startlinie geplant." | `RaceWeekCard` (carb grams), `RaceStrategy` splits, Plan A/B |
| 8 | Pricing | „Selbst hosten oder loslegen." Two columns: **Self-host** 0 € (AGPL-3.0, your Neon/Vercel or Docker, docs) · **Runmate** Free 0 € · Plus 9 €/month (79 €/year) · 30-day Plus trial without a card, then Free | Plain table; a feature checkmark row shared by both columns |
| 9 | FAQ | Wie kommen meine Garmin-Daten rein? · Ist das offiziell von Garmin? (official Garmin Connect API; Apple Health via the Runmate shortcut, later the iOS app) · Wo liegen meine Daten? (EU region, export, deletion) · Ersetzt das einen Coach? · Halbmarathon? · Kündigung? | Text only |
| 10 | Final CTA | „Dein nächster Block beginnt Montag." | Week strip filling with teal "done" bars |
| 11 | Footer | Impressum · Datenschutz · GitHub · Methoden · Changelog · DE/EN | — |

## 3. Visual direction

- **Typography:** keep Inter for the UI so screenshots and page feel like one product. For headlines, add one contrasting display face with numeric character (e.g. *Inter Tight* at 600 with tight tracking, or *Space Grotesk*). Put big tabular figures front and centre („3:05", „4:23 /km", „62 km"), because numbers are the brand.
- **Colour (existing tokens):** background `220 14% 96%`, cards white, foreground `222 22% 12%`. Brand red `358 75% 59%` is used sparingly: CTA, the one highlighted number, the active method tab. Teal `174 72% 36%` always means "gelaufen/run", exactly as in the app (actual bars, done days). The `brand-soft` and `teal-soft` tokens go behind screenshot frames.
- **Imagery:** real product screenshots with demo data, cropped tight to one card each and never the full dashboard. Add one real element from running: the Porto GPX line as an SVG motif through hero and footer. No stock runners and no 3D blobs.
- **Motion:** minimal and meaningful. Week bars fill in on scroll, a plan-change entry "slides" a session to another day, and numbers count up once. Respect `prefers-reduced-motion`.
- **Dark mode:** there are no dark tokens yet (`darkMode: ['class']` is set, but only `:root` is defined). Define a dark set (bg ~`222 22% 8%`, card `222 18% 12%`, keep red/teal, slightly lighter teal) and ship dark screenshots via `<picture>` and the `prefers-color-scheme` media query.
- **Avoid:** purple gradients, "AI-powered" badges, centred everything, logo walls of fake customers, emoji feature grids, invented testimonials. Prefer an asymmetric 12-column grid with a wide week strip (no narrow stacked card columns).

## 4. Tech setup

- **Where:** in the same Next.js app as route group `app/(marketing)/` with `page.tsx` at `/`. The dashboard home moves to `/plan` (or `/app`) for signed-in users. A signed-in visit to `/` redirects to the dashboard. `middleware.ts` must make `/`, `/en`, `/preise`, `/methoden/*`, `/impressum`, `/datenschutz`, `sitemap.xml`, `robots.txt` and `/opengraph-image` public. The single-email allowlist moves behind a "beta/paid" flag once sign-ups open.
- **Rendering:** fully static (`export const dynamic = 'force-static'`). GitHub stars come via ISR (`revalidate: 86400`). No Clerk JS on marketing pages; this needs a separate layout without `ClerkProvider` (today it wraps everything in `app/layout.tsx`, so move it into the `(dashboard)` layout).
- **SEO:** `metadata` per locale, `alternates.languages` for de/en with hreflang and `x-default` → de, `app/sitemap.ts`, `app/robots.ts`, `opengraph-image.tsx` (Next OG: headline + week strip). Add JSON-LD `SoftwareApplication` with an offer. Each methodology gets its own indexable page from `methodologies/*.md`, which is also the long-tail SEO play.
- **i18n:** path prefix: `/` = de, `/en` = en, with dictionaries in `lib/i18n/{de,en}.ts` (typed object, no library needed for ~2 pages). The app UI stays German for now.
- **Analytics:** Vercel Web Analytics or Plausible/Umami (cookieless, EU), so no cookie banner. Track events for CTA clicks, the pricing toggle and the GitHub click.
- **Sign-up flow:** *30 Tage testen* → Clerk sign-up → onboarding workshop (Garmin connect, method, goal) → trial starts (`trial_ends_at` on the user (30 days)). Billing via Paddle (merchant of record) at day 30. While the multi-user backend isn't ready, the CTA becomes a waitlist (email into a Neon `waitlist` table plus double opt-in, a German legal requirement).
- **Performance budget:** LCP < 1.8 s on 4G, JS < 80 kB gz on the marketing page (mostly server components; motion via CSS and a tiny IntersectionObserver), images AVIF/WebP via `next/image`, hero image < 120 kB, CLS < 0.05, fonts via `next/font` with only Latin subsets.

## 5. Assets and build order

**Assets:** a demo-data seed (a fictional runner preparing for "Hamburg HM", a realistic 12-week block with one missed session, one sickness pause and one fatigue-guard event), about 8 card screenshots in light and dark at 2x, the OG image (de/en), a logo lockup (wordmark plus the red app icon from `app/icon.svg`), the Porto GPX SVG motif, and a 6–8 s loop of a plan change (MP4/WebM, < 400 kB).

**Build order**

1. Restructure: move `ClerkProvider` into the dashboard layout, add the `(marketing)` route group, make the middleware routes public, move the dashboard home.
2. Add dark-mode tokens in `globals.css`, plus a typography scale for marketing.
3. Demo seed plus a `?demo=1` render mode to capture screenshots (scripted with Playwright).
4. Build the hero, "how it works" and pricing sections in German.
5. Build the methods section and the `/methoden/[slug]` pages from `methodologies/*.md`.
6. Build the engine, insights and race-day sections with the motion bits.
7. Add FAQ, footer, Impressum/Datenschutz, the waitlist/Clerk sign-up and the trial flag.
8. Add SEO (sitemap, OG, hreflang, JSON-LD), the `/en` dictionary, analytics, a Lighthouse pass against the budget, and screenshot QA.

## Wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ● Runmate      Methoden  Engine  Preise  FAQ   GitHub ★   [Testen →]│
├──────────────────────────────────────────────────────────────────────┤
│ Lauf nach Plan.                    ┌─────────────┐                   │
│ Der Plan läuft mit.                │ HEUTE        │┌───────────────┐ │
│ Pläne nach Daniels, Pfitzinger…    │ Tempo 12 km  ││Mo Di Mi Do Fr │ │
│ [30 Tage testen]  [GitHub ansehen] │ 4:23 /km     ││▇▇ ▇▇ ░░ ▇▇ ░░ │ │
│ ~~~~~~ Porto GPX line ~~~~~~~~~~~  └─────────────┘└───────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│ Gebaut im Training für Porto 2026 · AGPL-3.0 · 1 HF-Modell · ★ 312        │
├──────────────────────────────────────────────────────────────────────┤
│ ① Garmin verbinden   ② Methode & Ziel   ③ Jeden Tag wissen, was ansteht│
├──────────────────────────────────────────────────────────────────────┤
│ Sieben Methoden. Keine Blackbox.                                      │
│ [Daniels][Pfitzinger][Hansons][Lydiard][80/20][Norwegian][Runmate]   │
│ Text + Quelle          │  generated week strip of that method        │
├──────────────────────────────────────────────────────────────────────┤
│ Verpasst? Krank? Müde?  │ Plan-Anpassungen log  │ Pause / Rückkehr   │
│ Der Plan reagiert.      │ Do → Sa · Regel 3 ↶   │ Fatigue guard      │
├──────────────────────────────────────────────────────────────────────┤
│ Sieh, ob dein Block wirkt.                                            │
│ [Blockfortschritt──────────][Longrun-Aufbau──][Zone-2-Tempo][Review]│
├──────────────────────────────────────────────────────────────────────┤
│ Bis zur Startlinie geplant. │ Rennwoche (Carbs g) │ Splits Plan A/B  │
├──────────────────────────────────────────────────────────────────────┤
│        Selbst hosten  0 €        │   Runmate  Free 0 € · Plus 9 €/Mon. │
│        AGPL-3.0, eigene DB            │   gehostet, Sync, Updates [Testen]│
├──────────────────────────────────────────────────────────────────────┤
│ FAQ ▸ Garmin-Daten ▸ Datenschutz ▸ Coach? ▸ Halbmarathon ▸ Kündigung │
├──────────────────────────────────────────────────────────────────────┤
│ Dein nächster Block beginnt Montag.   [30 Tage testen]               │
├──────────────────────────────────────────────────────────────────────┤
│ Impressum · Datenschutz · GitHub · Methoden · Changelog · DE | EN    │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile:** a single column with a 16 px gutter. The hero shows only `TodayCard`, and the week strip scrolls horizontally inside its frame (not the page). Method tabs become a horizontally scrollable chip row. The insights panels become a swipeable carousel with one panel per view. Pricing columns stack with the hosted tier first. A sticky bottom CTA bar appears after the hero.

**Open points for Livius:**
- **Garmin wording:** the Garmin login is unofficial, so the FAQ has to say that honestly before charging money.
- **Timing:** the "built for Porto" story gets much stronger after 8.11.
- **Dashboard address:** the dashboard currently sits at `/` and would have to move.
