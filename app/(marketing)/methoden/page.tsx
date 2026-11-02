import type { Metadata } from 'next'
import Link from 'next/link'
import { de } from '@/lib/i18n/de'
import { methodCatalogue } from '@/lib/marketing/methods'
import { abs, pageMetadata } from '@/lib/marketing/site'
import { Footer, Header } from '../_components/chrome'
import { Analytics } from '../_components/sections'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMetadata({ title: de.meta.methodsTitle, description: de.meta.methodsDescription, locale: 'de', path: '/methoden', alternates: { canonical: abs('/methoden') } })

export default function MethodsIndex() {
  const t = de
  return (
    <>
      <Header t={t} />
      <main className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
        <h1 className="font-display text-[clamp(2.4rem,5vw,3.75rem)] font-semibold leading-[1] tracking-[-0.035em]">{t.methods.allTitle}</h1>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">{t.methods.allSub}</p>
        <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
          {methodCatalogue().map((m) => (
            <li key={m.id} className="bg-card">
              <Link href={`/methoden/${m.id}`} className="block h-full p-6 hover:bg-secondary/50">
                <div className="text-xs text-muted-foreground">{m.family} · {m.distances.map((d) => t.methods.distances[d]).join(', ')}</div>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">{m.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{m.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer t={t} />
      <Analytics />
    </>
  )
}
