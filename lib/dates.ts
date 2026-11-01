// One "today" per runner: the calendar date in their profile's time zone (lib/profile.ts, default Europe/Berlin), on
// the server (Vercel runs in UTC) and in the browser alike.
import { parseISO } from 'date-fns'
import { currentScope } from '@/lib/scope'

export const timeZone = () => currentScope().profile.timezone

// 'YYYY-MM-DD' in the runner's time zone.
export function todayLocal(now = new Date(), tz = timeZone()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(now)
}

// The runner's date as a Date at local midnight, for date-fns arithmetic (weeks, 7/28-day windows).
export function localDate(now = new Date(), tz = timeZone()) {
  return parseISO(todayLocal(now, tz))
}
