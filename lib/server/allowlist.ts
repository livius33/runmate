// ALLOWED_EMAILS (self-hosting, invite-only instances): a comma-separated list of who may use the app
// (case-insensitive). Empty or unset = any signed-in Clerk user. Checked in the middleware and again where a handler
// establishes its user (getUserId/withUser, lib/server/scope.ts), so a route reached without the middleware is
// guarded too (12-04).
// The email comes from the session token's `email` claim, or — when the token has none — from the user's primary
// address at Clerk, so a session never passes just by lacking the claim. Adding the claim saves that lookup:
// Dashboard → Sessions → Customize session token → { "email": "{{user.primary_email_address}}" }.
// Edge-safe (the middleware imports it).
import { clerkClient } from '@clerk/nextjs/server'

export const ALLOWLIST_CACHE_MS = 5 * 60_000   // a decision per user is reused this long (no Clerk call per request)
const CACHE_MAX = 1000

export const allowedEmails = (raw = process.env.ALLOWED_EMAILS) =>
  (raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

const cache = new Map<string, { ok: boolean; until: number }>()
let cachedFor: string | undefined

// May this signed-in user in? `claimEmail` is the session token's `email` claim, when there is one.
export async function userAllowed(userId: string, claimEmail?: unknown, now = Date.now()): Promise<boolean> {
  const raw = process.env.ALLOWED_EMAILS
  const list = allowedEmails(raw)
  if (!list.length) return true
  if (cachedFor !== raw) { cache.clear(); cachedFor = raw }
  const hit = cache.get(userId)
  if (hit && hit.until > now) return hit.ok

  let email = typeof claimEmail === 'string' ? claimEmail.trim().toLowerCase() : ''
  if (!email) {
    const user = await (await clerkClient()).users.getUser(userId)
    email = user.primaryEmailAddress?.emailAddress.trim().toLowerCase() ?? ''
  }
  const ok = !!email && list.includes(email)
  if (cache.size >= CACHE_MAX) cache.clear()
  cache.set(userId, { ok, until: now + ALLOWLIST_CACHE_MS })
  return ok
}
