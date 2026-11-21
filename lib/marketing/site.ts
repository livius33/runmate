// Site-wide settings of the marketing pages (Phase 6), read at build time (the pages are static).
import type { Metadata } from 'next'
import { billingEnabled } from '@/lib/billing/config'
import type { Locale } from '@/lib/i18n'

const clean = (v: string | undefined) => v?.trim().replace(/\/$/, '') || null

// Canonical origin for sitemap, hreflang, OG and JSON-LD.
export const siteUrl = () => clean(process.env.NEXT_PUBLIC_SITE_URL) ?? 'https://runmate.dev'
// The public repository; unset while the repo is private, so no GitHub link (and never a star count) is shown.
export const repoUrl = () => clean(process.env.NEXT_PUBLIC_REPO_URL)
// Cookieless Vercel Web Analytics, only when asked for.
export const analyticsEnabled = () => ['1', 'true'].includes((process.env.NEXT_PUBLIC_VERCEL_ANALYTICS ?? '').trim().toLowerCase())
// Until billing is live the CTA is the waitlist; with BILLING_ENABLED it is the Clerk sign-up (trial starts there).
export const signUpOpen = () => billingEnabled()
export const SIGN_UP_PATH = '/sign-up'
// The waitlist form at the end of the landing page (/warteliste itself has no page, only its status pages).
export const WAITLIST_PATH = '/#warteliste'

export const abs = (path: string) => `${siteUrl()}${path}`

// Pages that exist in both languages: path per locale.
export const PAGES = {
  home: { de: '/', en: '/en' },
  pricing: { de: '/preise', en: '/en/pricing' },
} as const

// Canonical + hreflang (de, en, x-default → de) for a page with a translation; `only` for a German-only page.
export function alternates(page: keyof typeof PAGES, locale: Locale): Metadata['alternates'] {
  const p = PAGES[page]
  return { canonical: abs(p[locale]), languages: { de: abs(p.de), en: abs(p.en), 'x-default': abs(p.de) } }
}

export function pageMetadata(o: { title: string; description: string; locale: Locale; path: string; alternates: Metadata['alternates'] }): Metadata {
  return {
    metadataBase: new URL(siteUrl()),
    title: o.title,
    description: o.description,
    alternates: o.alternates,
    openGraph: {
      type: 'website', siteName: 'Runmate', title: o.title, description: o.description, url: abs(o.path),
      locale: o.locale === 'de' ? 'de_DE' : 'en_GB', alternateLocale: o.locale === 'de' ? ['en_GB'] : ['de_DE'],
    },
    twitter: { card: 'summary_large_image', title: o.title, description: o.description },
  }
}
