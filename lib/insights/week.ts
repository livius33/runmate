// Wochenrückblick: one plan week in numbers, its key sessions, and one focus for the next week.
// Pure and rule-based.
import { addDays, format, parseISO } from 'date-fns'
import { type PlanSession, type PlanWeek } from '@/lib/plan/types'
import { fmtKm, fmtPace } from '@/lib/plan/format'
import { dayLabel, planWeeks, weekSummary } from '@/lib/plan/effective'
import { checkPace, matchSessionRuns, type DatedRun } from '@/lib/plan/pace-check'
import { type EngineChange } from '@/lib/plan/engine'
import { rulesFor } from '@/lib/plan/rules'

const EASY_TARGET = 0.75     // below this share of Z1+Z2 time the week was too hard
const VOLUME_MIN = 0.9       // a finished week below 90 % of its target missed volume
const MIN_ZONE_S = 30 * 60   // less HR data than this: no 80/20 figure

export interface KeyResult {
  date: string
  title: string
  status: 'done' | 'missed' | 'moved' | 'open'
  text: string
}

export interface WeekReviewResult {
  week: PlanWeek
  running: boolean
  km: number
  targetKm: number
  pct: number
  runs: number
  easyPct: number | null
  keys: KeyResult[]
  tsbStart: number | null
  tsbEnd: number | null
  engineChanges: number
  focus: string
}

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')

export function weekReview({ week, today, sessions, runs, fitness, engineLog }: {
  week: PlanWeek
  today: string
  sessions: PlanSession[]
  runs: DatedRun[]
  fitness: { date: string; tsb: number }[]
  engineLog: EngineChange[]
}): WeekReviewResult {
  const running = week.end >= today
  const inWeek = (d: string) => d >= week.start && d <= week.end
  const weekRuns = runs.filter((r) => inWeek(r.date) && r.date <= today)
  const actual = new Map<string, number>()
  for (const r of weekRuns) actual.set(r.date, (actual.get(r.date) ?? 0) + r.km)
  const km = weekSummary(week, today, sessions, actual).doneKm

  const zones = weekRuns.map((r) => r.zonesS).filter((z): z is number[] => !!z)
  const zoneTotal = zones.reduce((t, z) => t + z.reduce((a, b) => a + b, 0), 0)
  const easyPct = zoneTotal >= MIN_ZONE_S
    ? Math.round((zones.reduce((t, z) => t + (z[0] ?? 0) + (z[1] ?? 0), 0) / zoneTotal) * 100) : null

  // Key sessions, paired swap-aware with the runs around them.
  const around = sessions.filter((s) => s.date >= day(week.start, -1) && s.date <= day(week.end, 1) && s.date <= today && s.type !== 'rest')
  const matched = matchSessionRuns(around, runs)
  const keys: KeyResult[] = []
  for (const s of sessions.filter((x) => x.key && x.type !== 'race' && inWeek(x.date))) {
    if (s.date >= today && !matched.get(s.date)) { keys.push({ date: s.date, title: s.title, status: 'open', text: 'steht noch an' }); continue }
    const run = matched.get(s.date) ?? null
    const c = checkPace(s, run)
    if (!run || c.actualS == null) { keys.push({ date: s.date, title: s.title, status: 'missed', text: 'verpasst' }); continue }
    const swapped = run.date !== s.date ? ` (gelaufen am ${dayLabel(run.date)})` : ''
    keys.push({ date: s.date, title: s.title, status: 'done',
      text: `${fmtPace(c.actualS)} (${signed(c.deltaS!)} s, ${c.verdict})${c.blockHr != null ? `, Block-HF ${c.blockHr}` : ''}${swapped}` })
  }
  // Key sessions the engine moved away from this week.
  for (const c of engineLog) {
    if (c.rule !== 'missed-key' || c.status !== 'active') continue
    const from = c.key.slice('missed-key:'.length)
    if (!inWeek(from)) continue
    const target = Object.entries(c.after).find(([, s]) => s.type !== 'rest')
    keys.push({ date: from, title: target?.[1].title ?? 'Kerneinheit', status: 'moved', text: target ? `verschoben auf ${dayLabel(target[0])}` : 'verschoben' })
  }
  keys.sort((a, b) => a.date.localeCompare(b.date))

  const tsbAt = (d: string) => fitness.find((p) => p.date === d)?.tsb ?? null
  const tsbStart = tsbAt(week.start)
  const tsbEnd = tsbAt(running ? today : week.end) ?? (fitness.length ? fitness[fitness.length - 1].tsb : null)

  const engineChanges = engineLog.filter((c) => c.status === 'active' && Object.keys(c.after).some(inWeek)).length

  const next = planWeeks().find((w) => w.start > week.end)
  const missed = keys.filter((k) => k.status === 'missed')
  let focus: string
  if (missed.length) {
    const nextKeys = sessions.filter((s) => s.key && s.type !== 'race' && next && s.date >= next.start && s.date <= next.end).map((s) => s.title)
    focus = `Kerneinheiten schützen: ${missed.map((k) => k.title).join(', ')} ${missed.length > 1 ? 'fehlten' : 'fehlte'}${nextKeys.length ? ` – ${nextKeys.join(' und ')} nicht ausfallen lassen` : ''}.`
  } else if (easyPct != null && easyPct < EASY_TARGET * 100) {
    focus = `Locker wirklich locker: nur ${easyPct} % in Z1+Z2, Ziel 80 %.`
  } else if (!running && km < week.km * VOLUME_MIN) {
    focus = `Umfang: ${fmtKm(km)} von ${fmtKm(week.km)} km. Nicht nachholen, einfach den Plan laufen.`
  } else if (tsbEnd != null && tsbEnd < rulesFor(week.start).tsbRed) {
    focus = `Erholung zuerst: Form TSB ${String(Math.round(tsbEnd)).replace('-', '−')}.`
  } else if (next) {
    focus = `Nächste Woche (KW ${next.kw}): ${next.focus}.`
  } else {
    focus = 'Renntag: Vertrau dem Plan.'
  }

  return {
    week, running, km, targetKm: week.km, pct: Math.round((km / week.km) * 100), runs: weekRuns.length,
    easyPct, keys, tsbStart, tsbEnd, engineChanges, focus,
  }
}
