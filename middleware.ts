import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Self-hosting: ALLOWED_EMAILS is a comma-separated list of who may sign in (case-insensitive). Empty or unset = any
// signed-in Clerk user. With a list set, a session without an email claim is rejected (add `email` to the Clerk session
// token: Dashboard → Sessions → Customize session token → { "email": "{{user.primary_email_address}}" }).
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

// Cron routes carry no Clerk session; they authenticate with CRON_SECRET themselves.
// The calendar feed is read by calendar apps and the Apple Health upload comes from an iOS Shortcut (no login);
// both check their own secret token.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/api/cron(.*)', '/api/calendar/(.*)', '/api/health/(.*)'])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return

  const { sessionClaims } = await auth.protect()
  if (!ALLOWED_EMAILS.length) return

  const email = typeof sessionClaims?.email === 'string' ? sessionClaims.email.trim().toLowerCase() : ''
  if (!email || !ALLOWED_EMAILS.includes(email)) {
    const signInUrl = new URL('/sign-in', req.url)
    signInUrl.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(signInUrl)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
