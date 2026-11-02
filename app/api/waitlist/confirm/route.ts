import { NextResponse } from 'next/server'
import { confirmWaitlist, hashToken, statusPath } from '@/lib/waitlist'
import { dbWaitlist } from '@/lib/waitlist/store'

// GET /api/waitlist/confirm?token=… (public, Phase 6): the double opt-in link from the confirmation mail.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  let status = 'error'
  let locale: 'de' | 'en' = 'de'
  if (process.env.DATABASE_URL) {
    try {
      const row = token ? await dbWaitlist.byTokenHash(hashToken(token)) : null
      locale = row?.locale ?? 'de'
      status = await confirmWaitlist(token, { repo: dbWaitlist, now: Math.floor(Date.now() / 1000) })
    } catch {
      console.error('[waitlist] confirm failed')
    }
  }
  return NextResponse.redirect(new URL(statusPath(locale, status), req.url), 303)
}
