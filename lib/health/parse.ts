// Reads what the iOS Shortcut sends. Shortcuts hands over numbers as text with German formatting or units
// ("7.432", "65,4 kg", "52 ms"), so every field is read leniently, by its own kind. Pure.
import { createHash } from 'crypto'
import { dayError } from '@/lib/dates'
import type { ActivitySummary } from '@/lib/sources/types'

export interface HealthDayInput {
  date: string
  sleepMin: number | null
  restingHr: number | null
  hrvMs: number | null
  steps: number | null
  activeKcal: number | null
  weightKg: number | null
}
export interface HealthWorkoutInput { id: string; date: string; type: string; start: string; minutes: number; kcal: number | null; avgHr: number | null }

// Apple's running workouts: skipped when the user has another source that provides runs (they would count twice);
// otherwise a run that carries a distance becomes an activity (source 'apple-health', deduplicated on import).
const RUNNING = /run|lauf|jogg/i

// A whole number. In text, a separator followed by exactly three digits groups thousands ("7.432", "12,345"); any
// other one is the decimal mark ("512,3 kcal" → 512).
function int(v: unknown, lo: number, hi: number): number | null {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? null : String(v).match(/-?\d[\d.,]*/)?.[0].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = typeof v === 'number' ? Math.round(v) : t ? Math.round(Number(t)) : NaN
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
function dec(v: unknown, lo: number, hi: number): number | null {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : Number(String(v).trim().replace(/\s|[a-zA-Z%]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(t) && t >= lo && t <= hi ? Math.round(t * 10) / 10 : null
}

// 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD.MM.YY' or an ISO date-time → 'YYYY-MM-DD'. The shape only: whether that day exists
// and may be stored is dayError's (lib/dates.ts).
export function parseDay(v: unknown): string | null {
  const t = String(v ?? '').trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/)
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

// The workout start as sent ('2026-06-30T07:12:34+02:00', '2026-06-30 07:12', '30.06.2026, 07:12') → local wall time,
// and UTC when the text carries an offset.
export function parseStart(start: string, date: string): { local: string; utc: string | null } {
  const iso = start.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  const de = start.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s+(\d{1,2}):(\d{2})/)
  const local = iso ? `${iso[1]}T${iso[2]}:${iso[3]}:${iso[4] ?? '00'}`
    : de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}T${de[4].padStart(2, '0')}:${de[5]}:00`
      : `${date}T00:00:00`
  const ms = iso && /(Z|[+-]\d{2}:?\d{2})$/.test(start) ? Date.parse(start) : NaN
  return { local, utc: Number.isFinite(ms) ? new Date(ms).toISOString().replace('.000Z', 'Z') : null }
}

function runSummary(w: Record<string, unknown>, id: string, start: string, date: string, minutes: number, kcal: number | null, avgHr: number | null): ActivitySummary | null {
  const km = dec(w?.distanceKm ?? w?.km, 0.1, 400)
  const m = km != null ? km * 1000 : dec(w?.distanceM, 100, 400000)
  if (m == null) return null
  const { local, utc } = parseStart(start, date)
  const movingS = Math.round(minutes * 60)
  return {
    sourceActivityId: id, startUtc: utc, startLocal: local, sport: 'running', name: null,
    distanceM: m, movingS, elapsedS: movingS, elevationGainM: null, avgSpeedMs: m / movingS, maxSpeedMs: null,
    avgHr, maxHr: null, avgCadenceSpm: null, calories: kcal, startLat: null, startLng: null,
  }
}

// Workouts in one upload. The Shortcut sends a day, at most a few: more is a Shortcut gone wrong (a whole history in
// one request) and is refused as a whole. A list cut short would be stored as the days' full list, and saveHealth
// would remove the stored workouts that were cut.
export const MAX_WORKOUTS = 200

// `latest`: the last day accepted, for the day itself and for every workout (the route passes tomorrow).
export function parseHealth(body: unknown, fallbackDate: string, opts: { keepRuns?: boolean; latest?: string } = {}):
  { ok: true; day: HealthDayInput; workouts: HealthWorkoutInput[] | null; runs: ActivitySummary[]; skipped: number } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'JSON-Objekt erwartet' }
  const b = body as Record<string, unknown>
  const date = b.date == null || b.date === '' ? fallbackDate : parseDay(b.date)
  if (!date) return { ok: false, error: 'date: als JJJJ-MM-TT oder TT.MM.JJJJ' }
  const latest = opts.latest ?? '9999-12-31'
  const badDay = dayError(date, latest)
  if (badDay) return { ok: false, error: `date: ${badDay}` }
  const sleepH = dec(b.sleepHours, 0, 24)
  const day: HealthDayInput = {
    date,
    sleepMin: int(b.sleepMin, 0, 1440) ?? (sleepH != null ? Math.round(sleepH * 60) : null),
    restingHr: int(b.restingHr, 25, 150),
    hrvMs: dec(b.hrvMs, 1, 400),
    steps: int(b.steps, 0, 200000),
    activeKcal: int(b.activeKcal, 0, 20000),
    weightKg: dec(b.weightKg, 30, 250),
  }
  let workouts: HealthWorkoutInput[] | null = null
  const runs: ActivitySummary[] = []
  let skipped = 0
  if (Array.isArray(b.workouts)) {
    if (b.workouts.length > MAX_WORKOUTS) return { ok: false, error: `workouts: höchstens ${MAX_WORKOUTS} pro Upload` }
    workouts = []
    for (const w of b.workouts as Record<string, unknown>[]) {
      const type = String(w?.type ?? '').trim().slice(0, 60)
      const minutes = dec(w?.minutes, 1, 1440)
      if (!type || minutes == null) { skipped++; continue }
      const start = String(w?.start ?? '').trim().slice(0, 40) || date
      const wDate = parseDay(start) ?? date
      if (dayError(wDate, latest)) { skipped++; continue }      // a start on a day that cannot be: not stored under it
      const id = createHash('sha256').update(`${wDate}|${start}|${type}`).digest('hex').slice(0, 32)
      const kcal = int(w?.kcal, 0, 10000), avgHr = int(w?.avgHr, 30, 230)
      if (RUNNING.test(type)) {
        const run = opts.keepRuns ? runSummary(w, id, start, wDate, minutes, kcal, avgHr) : null
        if (run) runs.push(run)
        else skipped++
        continue
      }
      workouts.push({ id, date: wDate, type, start, minutes, kcal, avgHr })
    }
  }
  const values = Object.values(day).filter((v) => v != null).length - 1
  if (values === 0 && !workouts?.length && !runs.length) return { ok: false, error: 'Keine Werte erkannt (steps, sleepMin, restingHr, hrvMs, activeKcal, weightKg, workouts)' }
  return { ok: true, day, workouts, runs, skipped }
}
