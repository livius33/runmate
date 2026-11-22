import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { de } from '@/lib/i18n/de'
import { methodById, methodCatalogue } from '@/lib/marketing/methods'
import { Markdown } from '@/lib/marketing/markdown'
import { abs, pageMetadata, repoUrl } from '@/lib/marketing/site'
import { Footer, Header, PrimaryCta } from '../../_components/chrome'
import { Analytics, GeneratedWeek } from '../../_components/sections'
import { Card } from '@/components/ui/card'

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
      <main className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:py-16">
        <Link href="/methoden" className="inline-flex min-h-11 items-center text-body-sm text-muted-foreground hover:text-foreground sm:min-h-0">← {t.methods.back}</Link>
        <div className="mt-4 grid gap-10 lg:grid-cols-12 lg:gap-12">
          <article className="min-w-0 lg:col-span-7">
            <div className="font-mono text-caption uppercase text-muted-foreground">{m.family} · {m.distances.map((d) => t.methods.distances[d]).join(', ')}</div>
            <h1 className="mt-2 text-title sm:text-display">{m.name}</h1>
            <p className="mt-4 max-w-[62ch] text-body text-muted-foreground">{m.summary}</p>
            <p className="mt-4 text-caption text-muted-foreground">
              {t.methods.fileNote}{' '}
              {repo && <a href={`${repo}/blob/main/methodologies/${m.id}.md`} className="break-all underline underline-offset-2 hover:text-foreground">methodologies/{m.id}.md</a>}
            </p>
            {/* The Markdown renderer (lib/marketing/markdown) carries its own sizes; set them to the type scale here */}
            <div className="mt-6 [&>div]:text-body [&_code]:text-body-sm [&_h2]:font-sans [&_h2]:text-title-sm"><Markdown source={m.body} /></div>
          </article>
          <aside className="grid min-w-0 content-start gap-4 lg:sticky lg:top-20 lg:col-span-5">
            {m.week && <GeneratedWeek week={m.week} t={t} />}
            <Card title={t.methods.params}>
              <dl className="grid gap-2 text-body-sm">
                {facts.map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-t border-border pt-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right tabular-nums">{v}</dd></div>)}
              </dl>
            </Card>
            <Card title={t.methods.sources}>
              <ul className="grid gap-2 text-body-sm">
                {m.sources.map((s) => <li key={`${s.author}${s.year}${s.title}`}><span className="font-medium">{s.author} ({s.year})</span>: <em>{s.title}</em>{s.note ? <span className="text-muted-foreground"> – {s.note}</span> : null}</li>)}
              </ul>
            </Card>
            <PrimaryCta t={t} className="justify-self-start" />
          </aside>
        </div>
      </main>
      <Footer t={t} />
      <Analytics />
    </>
  )
}
