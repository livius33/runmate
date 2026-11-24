import { NextResponse } from 'next/server'
import { asLocale, joinWaitlist, pendingMailer, statusPath } from '@/lib/waitlist'
import { dbWaitlist } from '@/lib/waitlist/store'
import { siteUrl } from '@/lib/marketing/site'
import { WAITLIST_BODY_BYTES, readForm, tooLargeResponse } from '@/lib/server/body'

// POST /api/waitlist (public, Phase 6): the landing page's plain HTML form. Answers with a 303 to a static status
// page, so it works without JS. No database (self-host without one, or a build preview) → the "error" page.
// The form is a few hundred bytes: a body over 8 KB is refused with 413 before it is read in full (12-04).
export async function POST(req: Request) {
  const read = await readForm(req, WAITLIST_BODY_BYTES)
  if (!read.ok) return tooLargeResponse(WAITLIST_BODY_BYTES)
  const form = read.value
  if (!form) return redirect(req, 'de', 'invalid')
  const locale = asLocale(form.get('locale'))
  if (!process.env.DATABASE_URL) return redirect(req, locale, 'error')
  try {
    const status = await joinWaitlist(
      { email: form.get('email'), locale, honeypot: form.get('website') },
      { repo: dbWaitlist, mailer: pendingMailer, now: Math.floor(Date.now() / 1000), baseUrl: siteUrl() },
    )
    return redirect(req, locale, status)
  } catch {
    console.error('[waitlist] sign-up failed')
    return redirect(req, locale, 'error')
  }
}

function redirect(req: Request, locale: 'de' | 'en', status: string) {
  return NextResponse.redirect(new URL(statusPath(locale, status), req.url), 303)
}
