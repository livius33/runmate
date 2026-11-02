import { NextResponse } from 'next/server'
import { hashToken, leaveWaitlist, statusPath } from '@/lib/waitlist'
import { dbWaitlist } from '@/lib/waitlist/store'

// GET /api/waitlist/leave?token=… (public, Phase 6): one-click removal from the list (link in every mail).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  let status = 'error'
  let locale: 'de' | 'en' = 'de'
  if (process.env.DATABASE_URL) {
    try {
      locale = (token && (await dbWaitlist.byTokenHash(hashToken(token)))?.locale) || 'de'
      status = await leaveWaitlist(token, { repo: dbWaitlist })
    } catch {
      console.error('[waitlist] leave failed')
    }
  }
  return NextResponse.redirect(new URL(statusPath(locale, status), req.url), 303)
}
