import Link from 'next/link'
import type { Dict } from '@/lib/i18n'
import { Footer, Header, WaitlistForm } from './chrome'

export const WAITLIST_STATUSES = ['sent', 'confirmed', 'removed', 'invalid', 'expired', 'error'] as const
export type WaitlistStatusKey = (typeof WAITLIST_STATUSES)[number]

// The page the waitlist form and mail links land on (static, one per status and locale).
export function WaitlistStatus({ t, status }: { t: Dict; status: WaitlistStatusKey }) {
  const s = t.waitlist.status[status]
  const retry = status === 'invalid' || status === 'expired'
  return (
    <>
      <Header t={t} />
      <main className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:py-24">
        <h1 className="text-title sm:text-display">{s.title}</h1>
        <p className="mt-3 max-w-[52ch] text-body text-muted-foreground">{s.text}</p>
        {retry && <WaitlistForm t={t} className="mt-6" />}
        <Link href={t.locale === 'en' ? '/en' : '/'} className="mt-8 inline-flex text-body-sm font-medium text-brand-text underline-offset-4 hover:underline">{t.waitlist.back}</Link>
      </main>
      <Footer t={t} />
    </>
  )
}
