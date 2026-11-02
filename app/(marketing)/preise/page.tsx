import type { Metadata } from 'next'
import { de } from '@/lib/i18n/de'
import { alternates, pageMetadata } from '@/lib/marketing/site'
import { PricingPage } from '../_components/Landing'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMetadata({ title: de.meta.pricingTitle, description: de.meta.pricingDescription, locale: 'de', path: '/preise', alternates: alternates('pricing', 'de') })

export default function Preise() {
  return <PricingPage t={de} />
}
