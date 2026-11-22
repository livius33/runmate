// The landing page (Phase 6), one component for both locales; sections follow docs/LANDING-PAGE.md §2.
// Server component: static at build time, no client JS of its own.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { Dict } from '@/lib/i18n'
import { methodCatalogue } from '@/lib/marketing/methods'
import { cn } from '@/lib/utils'
import { Footer, Header, PrimaryCta, SecondaryCta, WaitlistForm, ctaNote } from './chrome'
import { Analytics, CourseLine, Faq, JsonLd, MethodTabs, Pricing } from './sections'
import {
  BlockPanel, ChangesPanel, FatiguePanel, Frame, LongRunPanel, PausePanel, RaceWeekPanel, ReviewPanel, SplitsPanel,
  TodayPanel, WeekPanel, ZonePanel,
} from './panels'
import { WEEK_DONE } from '../_sample/fixture'

// DESIGN.md type: section headlines in display-lg (24 px on phones), a short lead in body, no display face of its own
// (Geist throughout; figures tabular). Bands 64 / 96 px apart, the content capped at 1200 px.
const H2 = 'text-title sm:text-display'
const SUB = 'mt-3 max-w-[58ch] text-body text-muted-foreground'
const WRAP = 'mx-auto max-w-[1200px] px-4 sm:px-6'

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={cn('scroll-mt-16 py-16 lg:py-24', className)}><div className={WRAP}>{children}</div></section>
}

function researchCount() {
  try { return readdirSync(path.join(process.cwd(), 'methodologies', 'research')).filter((f) => f.endsWith('.md') && !/^(README|RESEARCH)\.md$/.test(f)).length } catch { return 0 }
}

export function Landing({ t }: { t: Dict }) {
  const methods = methodCatalogue()
  const facts = [
    { n: String(methods.length), label: t.open.templates },
    { n: String(researchCount()), label: t.open.research },
    { n: '1', label: t.open.hrModel },
    { n: 'AGPL-3.0', label: t.open.licence },
  ]
  return (
    <>
      <JsonLd t={t} />
      <Header t={t} />
      <main>
        {/* Hero: the headline left, the real Today card over the week strip right; the Porto course behind */}
        <section className="relative overflow-hidden">
          <CourseLine className="pointer-events-none absolute -right-24 top-6 hidden h-[560px] w-[760px] text-foreground/[0.06] lg:block" />
          <div className={cn(WRAP, 'relative grid gap-10 pb-16 pt-12 sm:pt-16 lg:grid-cols-12 lg:gap-8 lg:pb-24 lg:pt-24')}>
            <div className="lg:col-span-6 lg:pt-6">
              <h1 className="text-display sm:text-hero">
                <span className="block">{t.hero.line1}</span>
                <span className="block text-muted-foreground">{t.hero.line2}</span>
              </h1>
              <p className="mt-5 max-w-[46ch] text-body text-muted-foreground">{t.hero.sub}</p>
              <div className="mt-8 flex flex-wrap gap-3"><PrimaryCta t={t} /><SecondaryCta t={t} /></div>
              <p className="mt-3 max-w-[46ch] text-body-sm text-muted-foreground">{ctaNote(t)}</p>
            </div>
            {/* Week strip on the tinted frame; the Today card overlaps its lower edge (one layer over the other) */}
            <div className="relative lg:col-span-6">
              <Frame tone="brand" className="pb-10 lg:ml-12 lg:pb-24">
                <div lang="de" className="overflow-x-auto"><div className="min-w-[320px]"><WeekPanel /></div></div>
              </Frame>
              <div lang="de" className="relative -mt-8 mx-3 lg:-mt-20 lg:ml-0 lg:mr-16">
                <TodayPanel className="shadow-overlay" />
              </div>
              <p className="mt-3 px-3 text-caption text-muted-foreground lg:px-0">{t.hero.sample}{t.hero.appLanguage ? ` · ${t.hero.appLanguage}` : ''}</p>
            </div>
          </div>
        </section>

        {/* Built in the open */}
        <section className="border-y border-border bg-card">
          <div className={cn(WRAP, 'grid gap-8 py-12 lg:grid-cols-12 lg:items-center')}>
            <div className="lg:col-span-5">
              <h2 className="text-title">{t.open.title}</h2>
              <p className="mt-2 max-w-[52ch] text-body-sm text-muted-foreground">{t.open.body}</p>
            </div>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:col-span-5">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="sr-only">{f.label}</dt>
                  <dd className={cn('flex h-10 items-end whitespace-nowrap tabular-nums', f.n.length > 3 ? 'text-title-sm' : 'text-display')}>{f.n}</dd>
                  <dd className="mt-1 text-caption text-muted-foreground">{f.label}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center gap-3 lg:col-span-2">
              <CourseLine className="h-16 w-20 shrink-0 text-foreground/70" />
              <span className="text-caption text-muted-foreground">{t.open.race}</span>
            </div>
          </div>
        </section>

        {/* How it works: a real sequence, so numbered */}
        <Section>
          <h2 className={H2}>{t.how.title}</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3 lg:gap-12">
            {t.how.steps.map((s, i) => (
              <li key={s.title} className="border-t-2 border-foreground pt-4">
                <span className="font-mono text-caption tabular-nums text-muted-foreground">{i + 1}</span>
                <h3 className="mt-2 text-title-sm">{s.title}</h3>
                <p className="mt-2 text-body text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Methods */}
        <Section id="methoden" className="bg-card">
          <div className="grid gap-3 lg:grid-cols-12 lg:gap-8">
            <h2 className={cn(H2, 'lg:col-span-6')}>{t.methods.title}</h2>
            <p className={cn(SUB, 'mt-0 lg:col-span-6 lg:pt-1')}>{t.methods.sub}</p>
          </div>
          <div className="mt-8"><MethodTabs methods={methods} t={t} /></div>
        </Section>

        {/* Adaptive engine */}
        <Section id="anpassung">
          <h2 className={H2}><span className="block">{t.engine.title}</span><span className="block text-muted-foreground">{t.engine.title2}</span></h2>
          <p className={SUB}>{t.engine.sub}</p>
          <div className="mt-8 grid gap-8 lg:grid-cols-12">
            <dl className="grid content-start gap-5 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
              {t.engine.items.map((x) => (
                <div key={x.title}>
                  <dt className="text-body font-semibold">{x.title}</dt>
                  <dd className="mt-1 text-body-sm text-muted-foreground">{x.text}</dd>
                </div>
              ))}
            </dl>
            <Frame tone="teal" caption={t.hero.sample} className="lg:col-span-8">
              <div lang="de" className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-7"><ChangesPanel /></div>
                <div className="grid content-start gap-3 md:col-span-5"><FatiguePanel /><PausePanel /></div>
              </div>
            </Frame>
          </div>
        </Section>

        {/* Insights: a swipeable row on phones, a wide grid from md */}
        <Section className="bg-card">
          <h2 className={H2}>{t.insights.title}</h2>
          <p className={SUB}>{t.insights.sub}</p>
          <div lang="de" className="-mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:items-start md:overflow-visible md:px-0 lg:grid-cols-4">
            <div className="w-[85%] shrink-0 snap-start md:w-auto lg:col-span-2"><BlockPanel /></div>
            <div className="w-[85%] shrink-0 snap-start md:w-auto lg:col-span-2"><ReviewPanel /></div>
            <div className="w-[85%] shrink-0 snap-start md:w-auto lg:col-span-2"><LongRunPanel /></div>
            <div className="w-[85%] shrink-0 snap-start md:w-auto lg:col-span-2"><ZonePanel /></div>
          </div>
          <p className="mt-3 text-caption text-muted-foreground">{t.hero.sample}</p>
        </Section>

        {/* Race week and race day */}
        <Section>
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className={H2}>{t.race.title}</h2>
              <p className={SUB}>{t.race.sub}</p>
            </div>
            <div lang="de" className="grid items-start gap-4 md:grid-cols-2 lg:col-span-8"><RaceWeekPanel /><SplitsPanel /></div>
          </div>
        </Section>

        {/* Pricing */}
        <Section id="preise" className="bg-card">
          <h2 className={H2}>{t.pricing.title}</h2>
          <p className={SUB}>{t.pricing.sub}</p>
          <div className="mt-8"><Pricing t={t} /></div>
        </Section>

        {/* FAQ */}
        <Section id="faq">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <h2 className={cn(H2, 'lg:col-span-4')}>{t.faq.title}</h2>
            <div className="lg:col-span-8"><Faq t={t} /></div>
          </div>
        </Section>
      </main>

      {/* Final CTA, the week strip filled */}
      <Footer t={t}>
        <div className={cn(WRAP, 'grid gap-10 py-16 lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-24')}>
          <div className="lg:col-span-6">
            <h2 className={H2}>{t.final.title}</h2>
            <p className={SUB}>{t.final.sub}</p>
            <WaitlistForm t={t} className="mt-6" />
          </div>
          <Frame tone="teal" className="lg:col-span-6">
            <div lang="de" className="overflow-x-auto"><div className="min-w-[340px]"><WeekPanel days={WEEK_DONE} done={WEEK_DONE.reduce((a, d) => a + (d.run ?? 0), 0)} animate={false} /></div></div>
          </Frame>
        </div>
      </Footer>
      <Analytics />
    </>
  )
}

// Pricing as its own page (/preise, /en/pricing): the same block plus the FAQ.
export function PricingPage({ t }: { t: Dict }) {
  return (
    <>
      <JsonLd t={t} />
      <Header t={t} />
      <main>
        <Section>
          <h1 className={H2}>{t.pricing.title}</h1>
          <p className={SUB}>{t.pricing.sub}</p>
          <div className="mt-8"><Pricing t={t} /></div>
        </Section>
        <Section id="faq" className="bg-card">
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <h2 className={cn(H2, 'lg:col-span-4')}>{t.faq.title}</h2>
            <div className="lg:col-span-8"><Faq t={t} /></div>
          </div>
        </Section>
        <Section><WaitlistForm t={t} /></Section>
      </main>
      <Footer t={t} />
      <Analytics />
    </>
  )
}
