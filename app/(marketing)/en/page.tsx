import type { Metadata } from 'next'
import { en } from '@/lib/i18n/en'
import { alternates, pageMetadata } from '@/lib/marketing/site'
import { Landing } from '../_components/Landing'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMetadata({ title: en.meta.title, description: en.meta.description, locale: 'en', path: '/en', alternates: alternates('home', 'en') })

// The root <html> says de; this subtree is English (hreflang tells search engines which page is which).
export default function EnglishHomePage() {
  return <div lang="en"><Landing t={en} /></div>
}
