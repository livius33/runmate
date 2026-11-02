import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { de } from '@/lib/i18n/de'
import { methodById, methodCatalogue } from '@/lib/marketing/methods'
import { Markdown } from '@/lib/marketing/markdown'
import { abs, pageMetadata, repoUrl } from '@/lib/marketing/site'
import { Footer, Header, PrimaryCta } from '../../_components/chrome'
import { Analytics, GeneratedWeek } from '../../_components/sections'

// One indexable page per methodology template (methodologies/<id>.md), built at build time.
export const dynamic = 'force-static'
export const dynamicParams = false
export const generateStaticParams = () => methodCatalogue().map((m) => ({ slug: m.id }))

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = methodById((await params).slug)
  if (!m) return {}
  return pageMetadata({ title: `${m.name} – Trainingsmethode | Runmate`, description: m.summary, locale: 'de', path: `/methoden/${m.id}`, alternates: { canonical: abs(`/methoden/${m.id}`) } })
}

const pct = (n: number) => `${Math.round(n * 100)} %`

export default async function MethodPage({ params }: Props) {
  const m = methodById((await params).slug)
  if (!m) notFound()
  const t = de
  const repo = repoUrl()
  const facts = [
    [t.methods.paramRuns, String(m.facts.runs)],
    [t.methods.paramLong, `${pct(m.facts.longShare)} · ${m.facts.longMaxKm} km`],
    [t.methods.paramRamp, pct(m.facts.rampMax)],
    [t.methods.paramEasy, pct(m.facts.easyBuild)],
    [t.methods.paramWeeks, `${m.facts.taperWeeks} Wochen`],
  ]
  return (
    <>
      <Header t={t} />
      <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/methoden" className="text-sm text-muted-foreground hover:text-foreground">← {t.methods.back}</Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          <article className="lg:col-span-7">
            <div className="text-sm text-muted-foreground">{m.family} · {m.distances.map((d) => t.methods.distances[d]).join(', ')}</div>
            <h1 className="mt-1 font-display text-[clamp(2.2rem,4.6vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em]">{m.name}</h1>
            <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-foreground/80">{m.summary}</p>
            <p className="mt-6 text-xs text-muted-foreground">
              {t.methods.fileNote}{' '}
              {repo && <a href={`${repo}/blob/main/methodologies/${m.id}.md`} className="underline underline-offset-2 hover:text-foreground">methodologies/{m.id}.md</a>}
            </p>
            <div className="mt-6"><Markdown source={m.body} /></div>
          </article>
          <aside className="grid content-start gap-6 lg:sticky lg:top-20 lg:col-span-5">
            {m.week && <GeneratedWeek week={m.week} t={t} />}
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-[15px] font-semibold tracking-tight">{t.methods.params}</h2>
              <dl className="mt-3 grid gap-2 text-sm">
                {facts.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-t border-border pt-2"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
              </dl>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-[15px] font-semibold tracking-tight">{t.methods.sources}</h2>
              <ul className="mt-3 grid gap-2 text-sm leading-snug">
                {m.sources.map((s) => <li key={`${s.author}${s.year}${s.title}`}><span className="font-medium">{s.author} ({s.year})</span>: <em>{s.title}</em>{s.note ? <span className="text-muted-foreground"> – {s.note}</span> : null}</li>)}
              </ul>
            </div>
            <PrimaryCta t={t} className="justify-self-start" />
          </aside>
        </div>
      </main>
      <Footer t={t} />
      <Analytics />
    </>
  )
}
