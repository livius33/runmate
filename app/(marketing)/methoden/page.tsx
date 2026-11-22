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
      <main className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-title sm:text-display">{t.methods.allTitle}</h1>
        <p className="mt-3 max-w-[58ch] text-body text-muted-foreground">{t.methods.allSub}</p>
        {/* A wide grid of same-shaped tiles (equal height on purpose), 1 → 2 → 3 across */}
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {methodCatalogue().map((m) => (
            <li key={m.id} className="min-w-0">
              <Link href={`/methoden/${m.id}`} className="block h-full rounded-card bg-card p-5 shadow-raised transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="font-mono text-caption uppercase text-muted-foreground">{m.family} · {m.distances.map((d) => t.methods.distances[d]).join(', ')}</div>
                <h2 className="mt-2 text-title-sm">{m.name}</h2>
                <p className="mt-2 line-clamp-3 text-body-sm text-muted-foreground">{m.summary}</p>
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
