import type { MetadataRoute } from 'next'
import { methodCatalogue } from '@/lib/marketing/methods'
import { abs, PAGES } from '@/lib/marketing/site'

// Every public, indexable page (Phase 6): the landing and pricing pages in de/en (with their alternates), the
// methodology pages and the legal pages. The app, the API and the waitlist status pages are not listed.
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const pair = (p: { de: string; en: string }, priority: number): MetadataRoute.Sitemap => (['de', 'en'] as const).map((l) => ({
    url: abs(p[l]), changeFrequency: 'weekly', priority: l === 'de' ? priority : Math.round((priority - 0.1) * 10) / 10,
    alternates: { languages: { de: abs(p.de), en: abs(p.en) } },
  }))
  return [
    ...pair(PAGES.home, 1),
    ...pair(PAGES.pricing, 0.8),
    { url: abs('/methoden'), changeFrequency: 'monthly', priority: 0.7 },
    ...methodCatalogue().map((m) => ({ url: abs(`/methoden/${m.id}`), changeFrequency: 'monthly' as const, priority: 0.6 })),
    ...['/impressum', '/datenschutz', '/agb'].map((p) => ({ url: abs(p), changeFrequency: 'yearly' as const, priority: 0.2 })),
  ]
}
