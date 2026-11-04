// The wellness step of a pull source's sync (sources with capabilities.dailyWellness and fetchNight, today the Garmin
// login): fetch the nights that are missing, newest first, at most MAX_WELLNESS_REQUESTS per sync. Never fails the
// sync; a missing wellness_days table (deployed before the migration) skips the step.
import { addDays, format, parseISO } from 'date-fns'
import { SourceError, type SourceErrorCode, type WellnessNight } from '@/lib/sources/types'
import type { StoredNight } from './store'

export const MAX_WELLNESS_REQUESTS = 8
export const WINDOW_DAYS = 7          // nights looked at on a normal sync
export const BACKFILL_DAYS = 28       // … while fewer than MIN_STORED nights have data (first runs)
const MIN_STORED = 7
export const EMPTY_RETRY_DAYS = 3     // an empty (or HRV-less) night is fetched again after this many days
const MAX_ERRORS = 2                  // source errors in a row before the step gives up for this sync
// Errors that the next night would only repeat: stop at once.
const STOP: SourceErrorCode[] = ['rate-limited', 'not-connected', 'auth', 'mfa', 'locked', 'login-changed']

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const complete = (n: WellnessNight) => n.sleepS != null && n.hrvAvg != null

// Which mornings to fetch, newest first. A night fetched on its own morning is retried by the next sync (the watch
// may not have synced yet); other incomplete nights wait EMPTY_RETRY_DAYS. `dayOf` = the runner's calendar day of an
// instant (todayLocal).
export function nightsToFetch(today: string, stored: StoredNight[], nowS: number, dayOf: (d: Date) => string): string[] {
  const byDate = new Map(stored.map((n) => [n.date, n]))
  const withData = stored.filter((n) => n.sleepS != null).length
  const window = withData < MIN_STORED ? BACKFILL_DAYS : WINDOW_DAYS
  const out: string[] = []
  for (let i = 0; i < window; i++) {
    const d = day(today, -i)
    const row = byDate.get(d)
    if (!row) { out.push(d); continue }
    if (complete(row)) continue
    const fetchedOn = dayOf(new Date(row.fetchedAt * 1000))
    if (fetchedOn <= d || nowS - row.fetchedAt >= EMPTY_RETRY_DAYS * 86400) out.push(d)
  }
  return out
}

export interface WellnessDeps {
  today: string
  nowS: number
  dayOf: (d: Date) => string
  fetchNight: (date: string, requestsLeft: number) => Promise<{ night: WellnessNight; requests: number }>
  load: (from: string) => Promise<StoredNight[]>
  save: (nights: WellnessNight[]) => Promise<void>
}

export interface WellnessResult { fetched: number; withData: number; requests: number; errors: { date: string; code: SourceErrorCode }[] }

export async function syncWellness({ today, nowS, dayOf, fetchNight, load, save }: WellnessDeps): Promise<WellnessResult> {
  const stored = await load(day(today, -(BACKFILL_DAYS - 1)))
  const dates = nightsToFetch(today, stored, nowS, dayOf)
  const r: WellnessResult = { fetched: 0, withData: 0, requests: 0, errors: [] }
  const prev = new Map(stored.map((n) => [n.date, n]))
  const out: WellnessNight[] = []
  let errorsInRow = 0
  for (const d of dates) {
    const left = MAX_WELLNESS_REQUESTS - r.requests
    if (left < 1 || errorsInRow >= MAX_ERRORS) break
    try {
      const { night, requests } = await fetchNight(d, left)
      r.requests += requests
      errorsInRow = 0
      // A refetch that comes back empty never wipes a night that had data (only the fetch time moves on).
      const p = prev.get(d)
      out.push(night.sleepS == null && p?.sleepS != null ? (({ fetchedAt: _, ...n }) => n)(p) : night)
    } catch (err) {
      r.requests++
      errorsInRow++
      // Only the code: library errors can carry request data (lib/sources/sync.ts safeError).
      const code = err instanceof SourceError ? err.code : 'unknown'
      r.errors.push({ date: d, code })
      if (STOP.includes(code)) break
    }
  }
  if (out.length) await save(out)
  r.fetched = out.length
  r.withData = out.filter((n) => n.sleepS != null).length
  return r
}

// The step as the sync runs it: logs (counts and error codes only), never throws.
export async function wellnessStep(log: string[], deps: () => Promise<WellnessDeps>, isMissingTable: (err: unknown) => boolean, label = 'wellness') {
  try {
    const r = await syncWellness(await deps())
    log.push(`${label}: ${r.fetched} nights stored (${r.withData} with data), ${r.requests} requests`)
    for (const e of r.errors) log.push(`${label} fetch failed: ${e.date} (${e.code})`)
  } catch (err) {
    log.push(isMissingTable(err)
      ? `${label}: table wellness_days missing (migration pending), skipped`
      : `${label} failed (${err instanceof SourceError ? err.code : 'unknown'})`)
  }
}
