import type { Metadata } from 'next'
import { de } from '@/lib/i18n/de'
import { alternates, pageMetadata } from '@/lib/marketing/site'
import { Landing } from './_components/Landing'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMetadata({ title: de.meta.title, description: de.meta.description, locale: 'de', path: '/', alternates: alternates('home', 'de') })

export default function HomePage() {
  return <Landing t={de} />
}
