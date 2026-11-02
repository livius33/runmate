// Methods tabs, pricing, FAQ, the Porto course line, analytics and JSON-LD (Phase 6). Server components; the tabs and
// the pricing toggle are radio inputs styled with :has() (no JS); the FAQ is <details>.
import Link from 'next/link'
import { Check } from 'lucide-react'
import { TypeTag } from '@/components/plan/ui'
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
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[15px] font-semibold tracking-tight">{t.methods.week} · {week.phase}</div>
        <div className="text-sm tabular-nums text-muted-foreground"><span className="font-display text-2xl font-semibold text-foreground">{week.km}</span> {t.methods.total}</div>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{t.methods.weekFor} {week.goal}</p>
      <ul className="mt-4 grid gap-2" lang="de">
        {week.days.map((d, i) => (
          <li key={d.date} className="grid grid-cols-[1.75rem_6.5rem_1fr_3rem] items-center gap-2 text-sm sm:grid-cols-[2rem_7.5rem_1fr_3.5rem]">
            <span className="text-muted-foreground">{WEEKDAY[i]}</span>
            <span className="truncate"><TypeTag type={d.type} /></span>
            <span className="h-2 rounded-full bg-secondary" title={d.title}>
              {d.km > 0 && <span className={cn('block h-full rounded-full', d.key ? 'bg-brand' : 'bg-foreground/60')} style={{ width: `${(d.km / max) * 100}%` }} />}
            </span>
            <span className="text-right tabular-nums">{d.km ? `${fmtKm(d.km)}` : '–'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MethodTabs({ methods, t }: { methods: MethodEntry[]; t: Dict }) {
  // One rule per method: the checked radio shows its panel (keeps the markup free of JS).
  const css = methods.map((m) => `.mk-methods:has(#mt-${m.id}:checked) [data-panel="${m.id}"]{display:grid}`).join('')
  return (
    <div className="mk-methods">
      <style>{css}</style>
      <fieldset>
        <legend className="sr-only">{t.methods.pick}</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {methods.map((m, i) => (
            <label key={m.id} className="shrink-0 cursor-pointer">
              <input type="radio" name="method" id={`mt-${m.id}`} defaultChecked={i === 0} className="peer sr-only" data-track="method_tab" />
              <span className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm text-muted-foreground transition-colors hover:text-foreground peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">
                {m.family} · {t.methods.distances[m.distances[0]]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {methods.map((m) => (
        <div key={m.id} data-panel={m.id} className="mt-6 hidden gap-6 md:grid-cols-12">
          <div className="md:col-span-5">
            <h3 className="font-display text-2xl font-semibold tracking-tight" lang="de">{m.name}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-foreground/80" lang="de">{m.summary}</p>
            <div className="mt-4 text-sm">
              <span className="text-muted-foreground">{t.methods.sources}: </span>
              {m.sources.slice(0, 2).map((s) => `${s.author} (${s.year})`).join('; ')}
            </div>
            <Link href={`/methoden/${m.id}`} className="mt-5 inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline">{t.methods.read}</Link>
          </div>
          <div className="md:col-span-7">{m.week && <GeneratedWeek week={m.week} t={t} />}</div>
        </div>
      ))}
      <p className="mt-6 max-w-2xl text-sm text-muted-foreground"><span className="font-medium text-foreground">{t.methods.own}.</span> {t.methods.ownText}</p>
    </div>
  )
}

export function Pricing({ t }: { t: Dict }) {
  const p = t.pricing
  const repo = repoUrl()
  const Points = ({ items }: { items: string[] }) => (
    <ul className="mt-5 grid gap-2 text-sm">{items.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />{x}</li>)}</ul>
  )
  const Price = ({ month, year }: { month: string; year: string }) => (
    <div className="mt-4 flex items-baseline gap-1.5">
      <span data-interval="month" className="font-display text-5xl font-semibold tracking-tight tabular-nums">{month}</span>
      <span data-interval="month" className="text-sm text-muted-foreground">{p.perMonth}</span>
      <span data-interval="year" className="font-display text-5xl font-semibold tracking-tight tabular-nums">{year}</span>
      <span data-interval="year" className="text-sm text-muted-foreground">{p.perYear}</span>
    </div>
  )
  return (
    <div className="mk-pricing">
      <fieldset className="inline-flex rounded-full border border-border bg-card p-1 text-sm">
        <legend className="sr-only">{p.month} / {p.year}</legend>
        {(['month', 'year'] as const).map((k) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name="bill" id={`bill-${k}`} defaultChecked={k === 'month'} className="peer sr-only" data-track={`pricing_${k}`} />
            <span className="inline-flex h-8 items-center rounded-full px-4 text-muted-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{p[k]}</span>
          </label>
        ))}
      </fieldset>
      <div className="mt-6 grid gap-4 lg:grid-cols-12">
        {/* Hosted first on phones (the plan's mobile order), self-host first on wide screens */}
        <div className="order-2 rounded-2xl border border-border bg-card p-6 lg:order-1 lg:col-span-4">
          <h3 className="text-lg font-semibold">{p.selfHost.name}</h3>
          <div className="mt-4 flex items-baseline gap-2"><span className="font-display text-5xl font-semibold tracking-tight">{p.selfHost.price}</span><span className="text-sm text-muted-foreground">{p.selfHost.note}</span></div>
          <Points items={p.selfHost.points} />
          {repo && <a href={`${repo}#readme`} data-track="github_click" className="mt-6 inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline">{p.selfHost.cta}</a>}
        </div>
        <div className="order-1 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2 lg:order-2 lg:col-span-8">
          {([p.basic, p.plus] as const).map((tier, i) => (
            <div key={tier.name} className={cn(i === 1 && 'sm:border-l sm:border-border sm:pl-6')}>
              <h3 className="text-lg font-semibold">Runmate {tier.name}</h3>
              <Price month={tier.month} year={tier.year} />
              <Points items={tier.points} />
            </div>
          ))}
          <div className="grid gap-3 border-t border-border pt-5 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <p className="text-sm text-muted-foreground">{p.trial} {p.always}</p>
            <PrimaryCta t={t} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function Faq({ t }: { t: Dict }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {t.faq.items.map((f) => (
        <details key={f.q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-foreground/80">{f.a}</p>
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

// SoftwareApplication with the three offers (self-host, Basic, Plus), for search engines.
export function JsonLd({ t }: { t: Dict }) {
  const offer = (name: string, price: string, extra?: object) => ({ '@type': 'Offer', name, price, priceCurrency: 'EUR', ...extra })
  const month = { priceSpecification: { '@type': 'UnitPriceSpecification', billingDuration: 'P1M' } }
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
      offer('Runmate Basic', '6', month),
      offer('Runmate Plus', '10', month),
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
