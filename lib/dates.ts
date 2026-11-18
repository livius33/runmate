// One "today" per runner: the calendar date in their profile's time zone (lib/profile.ts, default Europe/Berlin), on
// the server (Vercel runs in UTC) and in the browser alike.
import { parseISO } from 'date-fns'
import { currentScope } from '@/lib/scope'

export const timeZone = () => currentScope().profile.timezone

// 'YYYY-MM-DD' in the runner's time zone.
export function todayLocal(now = new Date(), tz = timeZone()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(now)
}

// The day a record sent by a user may carry: a real calendar day ('2026-02-31' is none) between EARLIEST_DAY and
// `latest` (today, or tomorrow where the sender's clock may be ahead of the profile's time zone). Pure.
export const EARLIEST_DAY = '2000-01-01'   // before any watch or phone data a runner could bring; keeps the year 1 and typos out
export const isCalendarDay = (ymd: string) => /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(parseISO(ymd).getTime())
// Why `ymd` cannot be that day (German, to follow the field's name), or null.
export function dayError(ymd: string, latest: string): string | null {
  if (!isCalendarDay(ymd)) return 'diesen Tag gibt es nicht'
  if (ymd < EARLIEST_DAY) return 'frühestens 01.01.2000'
  if (ymd > latest) return 'liegt in der Zukunft'
  return null
}

// The runner's date as a Date at local midnight, for date-fns arithmetic (weeks, 7/28-day windows).
export function localDate(now = new Date(), tz = timeZone()) {
  return parseISO(todayLocal(now, tz))
}
