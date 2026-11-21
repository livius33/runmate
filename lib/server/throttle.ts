// Per-user limits for the expensive or abusable routes (12-04): Garmin sign-in attempts, manual sync, history import,
// forced re-import of one activity, the data export. A sliding window per user and limit: at most `max` events in
// `windowMs`; a cooldown is a window with max 1. The counters live in the user's settings (key 'throttle:<name>'), so
// they survive serverless instances without a migration. Not throttled: the daily cron (it never goes through these
// routes) and anything a user does for the first time.
import { NextResponse } from 'next/server'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'

export interface Limit { max: number; windowMs: number }

const MIN = 60_000

export const LIMITS = {
  // Failed sign-ins per source: the sixth inside an hour is refused before Garmin is contacted. A success resets it.
  connectFailures: { max: 5, windowMs: 60 * MIN },
  sync: { max: 1, windowMs: 1 * MIN },
  // A full history import starts with page 0; the pages after it come in a loop from the browser (50 activities each).
  historyStart: { max: 1, windowMs: 5 * MIN },
  historyPages: { max: 200, windowMs: 60 * MIN },
  enrichForce: { max: 1, windowMs: 30_000 },
  export: { max: 1, windowMs: 2 * MIN },
} satisfies Record<string, Limit>

// ── Pure ─────────────────────────────────────────────────────────────────────

// The event times (ms) still inside the window, oldest first; anything unreadable counts as none.
export function recent(stored: unknown, now: number, limit: Limit): number[] {
  if (!Array.isArray(stored)) return []
  return stored.filter((t): t is number => typeof t === 'number' && t > now - limit.windowMs && t <= now).sort((a, b) => a - b)
}

// Seconds until one more event is allowed, or 0 when it is allowed now.
export function retryAfter(times: number[], now: number, limit: Limit): number {
  if (times.length < limit.max) return 0
  const freesAt = times[times.length - limit.max] + limit.windowMs
  return Math.max(1, Math.ceil((freesAt - now) / 1000))
}

// ── Store (settings, scoped to the current user) ────────────────────────────

const key = (name: string) => `throttle:${name}`

// Seconds to wait, or 0.
export async function throttleWait(name: string, limit: Limit, now = Date.now()): Promise<number> {
  return retryAfter(recent(await getSettingJson<unknown>(key(name)), now, limit), now, limit)
}

export async function throttleHit(name: string, limit: Limit, now = Date.now()): Promise<void> {
  const times = recent(await getSettingJson<unknown>(key(name)), now, limit)
  await setSettingJson(key(name), [...times, now].slice(-limit.max))
}

export async function throttleReset(name: string): Promise<void> {
  await setSettingJson(key(name), [])
}

export function tooManyResponse(seconds: number) {
  const wait = seconds >= 90 ? `${Math.ceil(seconds / 60)} Minuten` : `${seconds} Sekunden`
  return NextResponse.json(
    { ok: false, error: `Zu viele Anfragen. Bitte in ${wait} erneut versuchen.`, code: 'rate-limited' },
    { status: 429, headers: { 'Retry-After': String(seconds) } },
  )
}

// A cooldown or quota for a route: 429 when the limit is reached, otherwise the request is counted and null returned.
// Counted before the work runs, so a failing or slow request cannot be repeated without limit.
export async function throttle(name: string, limit: Limit, now = Date.now()): Promise<Response | null> {
  const times = recent(await getSettingJson<unknown>(key(name)), now, limit)
  const wait = retryAfter(times, now, limit)
  if (wait) return tooManyResponse(wait)
  await setSettingJson(key(name), [...times, now].slice(-limit.max))
  return null
}
