// Methods tabs, pricing, FAQ, the Porto course line, analytics and JSON-LD (Phase 6). Server components; the tabs and
// the pricing toggle are radio inputs styled with :has() (no JS); the FAQ is <details>.
import Link from 'next/link'
import { Check } from 'lucide-react'
import { TypeTag } from '@/components/plan/tags'
import { Card } from '@/components/ui/card'
import type { Dict } from '@/lib/i18n'
import type { MethodEntry, SampleWeek } from '@/lib/marketing/methods'
import { portoCourse } from '@/lib/marketing/course'
import { abs, analyticsEnabled, repoUrl } from '@/lib/marketing/site'
import { cn } from '@/lib/utils'
import { PrimaryCta } from './chrome'

const fmtKm = (n: number) => String(n).replace('.', ',')
const WEEKDAY = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

// A generated week: one row per day, km as a bar (key sessions in brand red, the rest in ink).
export function GeneratedWeek({ week, t }: { week: SampleWeek; t: Dict }) {
  const max = Math.max(...week.days.map((d) => d.km), 1)
  return (
    <Card as="div">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="text-body font-semibold">{t.methods.week} · {week.phase}</div>
          <p className="text-caption text-muted-foreground">{t.methods.weekFor} {week.goal}</p>
        </div>
        <div className="text-body-sm tabular-nums text-muted-foreground"><span className="text-title text-foreground">{week.km}</span> {t.methods.total}</div>
      </div>
      <ul className="mt-4 grid gap-2" lang="de">
        {week.days.map((d, i) => (
          <li key={d.date} className="grid grid-cols-[1.75rem_6.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-body-sm sm:grid-cols-[2rem_7.5rem_minmax(0,1fr)_3.5rem]">
            <span className="font-mono text-caption uppercase text-muted-foreground">{WEEKDAY[i]}</span>
            <span className="min-w-0 truncate"><TypeTag type={d.type} /></span>
            <span className="h-2 rounded-full bg-secondary" title={d.title}>
              {d.km > 0 && <span className={cn('block h-full rounded-full', d.key ? 'bg-brand' : 'bg-foreground/60')} style={{ width: `${(d.km / max) * 100}%` }} />}
            </span>
            <span className="text-right tabular-nums">{d.km ? `${fmtKm(d.km)}` : '–'}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function MethodTabs({ methods, t }: { methods: MethodEntry[]; t: Dict }) {
  // One rule per method: the checked radio shows its panel (keeps the markup free of JS).
  const css = methods.map((m) => `.mk-methods:has(#mt-${m.id}:checked) [data-panel="${m.id}"]{display:grid}`).join('')
  return (
    <div className="mk-methods">
      <style>{css}</style>
      {/* min-w-0: a fieldset defaults to min-content width, which would let the scrolling tab row widen the page */}
      <fieldset className="min-w-0">
        <legend className="sr-only">{t.methods.pick}</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {methods.map((m, i) => (
            <label key={m.id} className="relative shrink-0 cursor-pointer">
              <input type="radio" name="method" id={`mt-${m.id}`} defaultChecked={i === 0} className="peer sr-only" data-track="method_tab" />
              <span className="inline-flex h-9 items-center whitespace-nowrap rounded-control bg-card px-3 text-body-sm text-muted-foreground shadow-hairline transition-colors hover:text-foreground peer-checked:bg-foreground peer-checked:text-background peer-checked:shadow-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                {m.family} · {t.methods.distances[m.distances[0]]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {methods.map((m) => (
        <div key={m.id} data-panel={m.id} className="mt-6 hidden gap-6 md:grid-cols-12 lg:gap-8">
          <div className="md:col-span-5">
            <h3 className="text-title" lang="de">{m.name}</h3>
            <p className="mt-2 text-body text-muted-foreground" lang="de">{m.summary}</p>
            <div className="mt-4 text-body-sm">
              <span className="text-muted-foreground">{t.methods.sources}: </span>
              {m.sources.slice(0, 2).map((s) => `${s.author} (${s.year})`).join('; ')}
            </div>
            <Link href={`/methoden/${m.id}`} className="mt-4 inline-flex text-body-sm font-medium text-brand-text underline-offset-4 hover:underline">{t.methods.read}</Link>
          </div>
          <div className="md:col-span-7">{m.week && <GeneratedWeek week={m.week} t={t} />}</div>
        </div>
      ))}
      <p className="mt-6 max-w-[68ch] text-body-sm text-muted-foreground"><span className="font-medium text-foreground">{t.methods.own}.</span> {t.methods.ownText}</p>
    </div>
  )
}

export function Pricing({ t }: { t: Dict }) {
  const p = t.pricing
  const repo = repoUrl()
  const Points = ({ items }: { items: string[] }) => (
    <ul className="mt-5 grid gap-2 text-body-sm">{items.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />{x}</li>)}</ul>
  )
  const Price = ({ month, year }: { month: string; year: string }) => (
    <div className="mt-4 flex items-baseline gap-1.5">
      <span data-interval="month" className="text-display tabular-nums">{month}</span>
      <span data-interval="month" className="text-body-sm text-muted-foreground">{p.perMonth}</span>
      <span data-interval="year" className="text-display tabular-nums">{year}</span>
      <span data-interval="year" className="text-body-sm text-muted-foreground">{p.perYear}</span>
    </div>
  )
  return (
    <div className="mk-pricing">
      <fieldset className="inline-flex gap-1 rounded-control bg-card p-1 text-body-sm shadow-hairline">
        <legend className="sr-only">{p.month} / {p.year}</legend>
        {(['month', 'year'] as const).map((k) => (
          <label key={k} className="relative cursor-pointer">
            <input type="radio" name="bill" id={`bill-${k}`} defaultChecked={k === 'month'} className="peer sr-only" data-track={`pricing_${k}`} />
            <span className="inline-flex h-9 items-center rounded-[4px] px-3 text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{p[k]}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-12">
        {/* Hosted first on phones (the plan's mobile order), self-host first on wide screens */}
        <Card as="div" className="order-2 sm:p-6 lg:order-1 lg:col-span-4">
          <h3 className="text-title-sm">{p.selfHost.name}</h3>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2"><span className="text-display tabular-nums">{p.selfHost.price}</span><span className="text-body-sm text-muted-foreground">{p.selfHost.note}</span></div>
          <Points items={p.selfHost.points} />
          {repo && <a href={`${repo}#readme`} data-track="github_click" className="mt-6 inline-flex text-body-sm font-medium text-brand-text underline-offset-4 hover:underline">{p.selfHost.cta}</a>}
        </Card>
        <Card as="div" className="order-1 grid gap-6 sm:grid-cols-2 sm:p-6 lg:order-2 lg:col-span-8">
          {/* Free has one price whatever the toggle says; Plus follows it */}
          <div>
            <h3 className="text-title-sm">{p.free.name}</h3>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2"><span className="text-display tabular-nums">{p.free.price}</span><span className="text-body-sm text-muted-foreground">{p.free.note}</span></div>
            <Points items={p.free.points} />
          </div>
          <div className="border-t border-border pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <h3 className="text-title-sm">Runmate {p.plus.name}</h3>
            <Price month={p.plus.month} year={p.plus.year} />
            <Points items={p.plus.points} />
          </div>
          <div className="grid gap-3 border-t border-border pt-5 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <p className="text-body-sm text-muted-foreground">{p.trial} {p.always}</p>
            <PrimaryCta t={t} />
          </div>
        </Card>
      </div>
    </div>
  )
}

export function Faq({ t }: { t: Dict }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {t.faq.items.map((f) => (
        <details key={f.q} className="group py-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-body font-medium [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="shrink-0 text-title-sm font-normal leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-1 max-w-[68ch] text-body text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  )
}

// The Porto Marathon course (examples/porto-2026), drawn once as a quiet line.
export function CourseLine({ className }: { className?: string }) {
  const c = portoCourse()
  if (!c) return null
  return (
    <svg viewBox={`-8 -8 ${c.width + 16} ${c.height + 16}`} className={className} aria-hidden preserveAspectRatio="xMidYMid meet">
      <path d={c.d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={c.finish[0]} cy={c.finish[1]} r="5" fill="hsl(var(--brand))" />
    </svg>
  )
}

// Cookieless Vercel Web Analytics (the script the @vercel/analytics package would inject; plain tags, no next/script
// client chunk), plus CTA / pricing /
// GitHub click events from data-track attributes. Only with NEXT_PUBLIC_VERCEL_ANALYTICS=1 at build time.
export function Analytics() {
  if (!analyticsEnabled()) return null
  const track = `document.addEventListener('click',function(e){var el=e.target&&e.target.closest&&e.target.closest('[data-track]');if(el&&window.va)window.va('event',{name:el.getAttribute('data-track')})},{capture:true});`
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};${track}` }} />
      <script defer src="/_vercel/insights/script.js" />
    </>
  )
}

// SoftwareApplication with its offers (self-host, Free, Plus per month and per year), for search engines.
export function JsonLd({ t }: { t: Dict }) {
  const offer = (name: string, price: string, extra?: object) => ({ '@type': 'Offer', name, price, priceCurrency: 'EUR', ...extra })
  const per = (billingDuration: string) => ({ priceSpecification: { '@type': 'UnitPriceSpecification', billingDuration } })
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Runmate',
    applicationCategory: 'SportsApplication',
    applicationSubCategory: 'Running training plans',
    operatingSystem: 'Web',
    inLanguage: t.locale,
    url: abs(t.locale === 'en' ? '/en' : '/'),
    description: t.meta.description,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    ...(repoUrl() ? { codeRepository: repoUrl() } : {}),
    offers: [
      offer(t.pricing.selfHost.name, '0'),
      offer('Runmate Free', '0'),
      offer('Runmate Plus', '9', per('P1M')),
      offer('Runmate Plus', '79', per('P1Y')),
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
