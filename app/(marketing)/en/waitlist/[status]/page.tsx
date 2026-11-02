import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { en } from '@/lib/i18n/en'
import { WAITLIST_STATUSES, WaitlistStatus, type WaitlistStatusKey } from '../../../_components/WaitlistStatus'

export const dynamic = 'force-static'
export const dynamicParams = false
export const generateStaticParams = () => WAITLIST_STATUSES.map((status) => ({ status }))
export const metadata: Metadata = { title: 'Waitlist – Runmate', robots: { index: false } }

export default async function Page({ params }: { params: Promise<{ status: string }> }) {
  const { status } = await params
  if (!WAITLIST_STATUSES.includes(status as WaitlistStatusKey)) notFound()
  return <div lang="en"><WaitlistStatus t={en} status={status as WaitlistStatusKey} /></div>
}
