import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { de } from '@/lib/i18n/de'
import { WAITLIST_STATUSES, WaitlistStatus, type WaitlistStatusKey } from '../../_components/WaitlistStatus'

export const dynamic = 'force-static'
export const dynamicParams = false
export const generateStaticParams = () => WAITLIST_STATUSES.map((status) => ({ status }))
export const metadata: Metadata = { title: 'Warteliste – Runmate', robots: { index: false } }

export default async function Page({ params }: { params: Promise<{ status: string }> }) {
  const { status } = await params
  if (!WAITLIST_STATUSES.includes(status as WaitlistStatusKey)) notFound()
  return <WaitlistStatus t={de} status={status as WaitlistStatusKey} />
}
