// Reads what the iOS Shortcut sends. Shortcuts hands over numbers as text with German formatting or units
// ("7.432", "65,4 kg", "52 ms"), so every field is read leniently, by its own kind. Pure.
import { createHash } from 'crypto'

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

// Running comes from Garmin; Apple's running workouts would count twice.
const RUNNING = /run|lauf|jogg/i

function int(v: unknown, lo: number, hi: number): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? Math.round(v) : Number(String(v).replace(/[^\d-]/g, ''))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}
function dec(v: unknown, lo: number, hi: number): number | null {
  if (v == null || v === '') return null
  const t = typeof v === 'number' ? v : Number(String(v).trim().replace(/\s|[a-zA-Z%]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(t) && t >= lo && t <= hi ? Math.round(t * 10) / 10 : null
}

// 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD.MM.YY' or an ISO date-time → 'YYYY-MM-DD'.
export function parseDay(v: unknown): string | null {
  const t = String(v ?? '').trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/)
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

export function parseHealth(body: unknown, fallbackDate: string):
  { ok: true; day: HealthDayInput; workouts: HealthWorkoutInput[] | null; skipped: number } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'JSON-Objekt erwartet' }
  const b = body as Record<string, unknown>
  const date = b.date == null || b.date === '' ? fallbackDate : parseDay(b.date)
  if (!date) return { ok: false, error: 'date: als JJJJ-MM-TT oder TT.MM.JJJJ' }
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
  let skipped = 0
  if (Array.isArray(b.workouts)) {
    workouts = []
    for (const w of b.workouts as Record<string, unknown>[]) {
      const type = String(w?.type ?? '').trim().slice(0, 60)
      const minutes = dec(w?.minutes, 1, 1440)
      if (!type || minutes == null) { skipped++; continue }
      if (RUNNING.test(type)) { skipped++; continue }
      const start = String(w?.start ?? '').trim().slice(0, 40) || date
      const wDate = parseDay(start) ?? date
      const id = createHash('sha256').update(`${wDate}|${start}|${type}`).digest('hex').slice(0, 32)
      workouts.push({ id, date: wDate, type, start, minutes, kcal: int(w?.kcal, 0, 10000), avgHr: int(w?.avgHr, 30, 230) })
    }
  }
  const values = Object.values(day).filter((v) => v != null).length - 1
  if (values === 0 && !workouts?.length) return { ok: false, error: 'Keine Werte erkannt (steps, sleepMin, restingHr, hrvMs, activeKcal, weightKg, workouts)' }
  return { ok: true, day, workouts, skipped }
}
