import type { MetadataRoute } from 'next'
import { abs } from '@/lib/marketing/site'

// Marketing pages are open to crawlers; the app, the API, sign-in and the waitlist status pages are not (Phase 6).
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/en', '/preise', '/en/pricing', '/methoden', '/impressum', '/datenschutz', '/agb'],
      disallow: ['/api/', '/plan', '/running', '/season', '/race', '/settings', '/sign-in', '/sign-up', '/warteliste', '/en/waitlist', '/kuendigen', '/demo'],
    }],
    sitemap: abs('/sitemap.xml'),
  }
}
