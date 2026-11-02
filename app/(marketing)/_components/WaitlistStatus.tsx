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
      <main className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
        <h1 className="font-display text-[clamp(2.4rem,5vw,3.75rem)] font-semibold leading-[1] tracking-[-0.035em]">{s.title}</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">{s.text}</p>
        {retry && <WaitlistForm t={t} className="mt-8" />}
        <Link href={t.locale === 'en' ? '/en' : '/'} className="mt-10 inline-flex text-sm font-medium text-brand underline-offset-4 hover:underline">{t.waitlist.back}</Link>
      </main>
      <Footer t={t} />
    </>
  )
}
