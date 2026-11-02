import type { Metadata } from 'next'
import { en } from '@/lib/i18n/en'
import { alternates, pageMetadata } from '@/lib/marketing/site'
import { PricingPage } from '../../_components/Landing'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMetadata({ title: en.meta.pricingTitle, description: en.meta.pricingDescription, locale: 'en', path: '/en/pricing', alternates: alternates('pricing', 'en') })

export default function Pricing() {
  return <div lang="en"><PricingPage t={en} /></div>
}
