// Erholung nach dem Rennen (any block with a recovery part, 07-22): is the recovery block going as planned? Same shape as the Rennbereitschaft
// card (verdict + one rated line per criterion). Pure and rule-based.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { HR_ZONES } from '@/lib/analytics/hr'
import { activeBlock } from '@/lib/plan/blocks'
import { type PlanSession } from '@/lib/plan/types'
import { fmtKm } from '@/lib/plan/format'
import { weekOf } from '@/lib/plan/blocks'
import { dayLabel } from '@/lib/plan/effective'
import type { DatedRun } from '@/lib/plan/pace-check'
import type { ReadinessLine } from './readiness'

export type RecoveryVerdict = 'Erholung läuft' | 'Etwas zu viel' | 'Erholung beendet'

const OVER_SHARE = 1.1     // up to 10 % more than planned is fine
const OVER_KM = 1          // … plus a rounding km
const HR_OVER_SHARE = 0.25 // more than a quarter of the runs above Z2: too fast for recovery
const Z2 = HR_ZONES[1]
const WEEKS: Record<number, string> = { 1: 'Eine Woche', 2: 'Zwei Wochen', 3: 'Drei Wochen', 4: 'Vier Wochen' }

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')

export function recoveryStatus({ today, sessions, runs, fitness }: {
  today: string
  sessions: PlanSession[]
  runs: DatedRun[]
  fitness: { date: string; tsb: number }[]
}): { verdict: RecoveryVerdict; lines: ReadinessLine[]; note: string } {
  const lines: ReadinessLine[] = []
  const block = activeBlock(today)
  const race = block.race
  const blocks = block.weeks.filter((w) => w.recovery)
  const week = weekOf(today)
  const after = runs.filter((r) => r.date > race.date && r.date <= today)
  let tooMuch = false

  // 1. This week's km against the plan so far (today counts once it is run)
  if (week?.recovery) {
    const ranToday = after.some((r) => r.date === today)
    const planned = sessions.filter((s) => s.date >= week.start && (s.date < today || (s.date === today && ranToday)))
      .reduce((t, s) => t + (s.type === 'rest' ? 0 : s.km ?? 0), 0)
    const done = after.filter((r) => r.date >= week.start).reduce((t, r) => t + r.km, 0)
    const idx = blocks.findIndex((w) => w.kw === week.kw) + 1
    const base = `Woche ${idx}/${blocks.length}: ${fmtKm(done)} von ${fmtKm(planned)} km bisher (Woche ${fmtKm(week.km)} km)`
    tooMuch = done > planned * OVER_SHARE + OVER_KM
    lines.push(!planned && !done
      ? { tone: 'ok', label: 'Umfang', text: `Woche ${idx}/${blocks.length} (${fmtKm(week.km)} km): bisher Ruhe, wie geplant.` }
      : tooMuch
      ? { tone: 'warn', label: 'Umfang', text: `${base}. Mehr als geplant: Erholung braucht Ruhe.` }
      : { tone: 'ok', label: 'Umfang', text: `${base}. ${done < planned ? 'Weniger ist in der Erholung in Ordnung.' : 'Im Plan.'}` })
  }

  // 2. Form: after a marathon TSB first drops (the race load), then climbs back. Rising from the
  // low since the race = recovering; back at race-day level = fresh again.
  const raceDay = fitness.find((f) => f.date === race.date)
  const since = fitness.filter((f) => f.date > race.date && f.date <= today)
  const now = since[since.length - 1]
  if (raceDay && now) {
    const low = since.reduce((m, f) => (f.tsb < m.tsb ? f : m))
    const days = differenceInCalendarDays(parseISO(now.date), parseISO(race.date))
    const tsb = `TSB ${signed(Math.round(now.tsb))} (Renntag ${signed(Math.round(raceDay.tsb))})`
    lines.push(now.tsb >= raceDay.tsb
      ? { tone: 'ok', label: 'Form', text: `${tsb}: wieder so frisch wie am Renntag.` }
      : now.tsb > low.tsb + 1
        ? { tone: 'ok', label: 'Form', text: `${tsb}: steigt wieder (Tief ${signed(Math.round(low.tsb))} am ${dayLabel(low.date)}), du erholst dich.` }
        : days <= 3
          ? { tone: 'open', label: 'Form', text: `${tsb}: das Tief direkt nach dem Rennen ist normal.` }
          : { tone: 'warn', label: 'Form', text: `${tsb}: steigt noch nicht, mehr Ruhe einbauen.` })
  } else {
    lines.push({ tone: 'open', label: 'Form', text: 'Noch keine Formdaten seit dem Rennen: einmal synchronisieren.' })
  }

  // 3. Easy really easy: share of runs since the race with Ø HR above Zone 2
  const withHr = after.filter((r) => r.avgHr != null)
  if (withHr.length) {
    const over = withHr.filter((r) => r.avgHr! > Z2.max)
    const share = over.length / withHr.length
    lines.push(share > HR_OVER_SHARE
      ? { tone: 'warn', label: 'Puls', text: `${over.length} von ${withHr.length} Läufen über HF ${Z2.max}: zu schnell für die Erholung.` }
      : { tone: 'ok', label: 'Puls', text: `${withHr.length === 1 ? 'Der Lauf' : `${withHr.length - over.length} von ${withHr.length} Läufen`} unter HF ${Z2.max}: locker genug.` })
  } else {
    lines.push({ tone: 'open', label: 'Puls', text: `Noch kein Lauf seit dem Rennen. Erste Läufe unter HF ${Z2.max}.` })
  }

  // 4. What comes next
  const done = today > block.end
  lines.push({
    tone: 'open', label: 'Danach',
    text: done ? 'Erholung abgeschlossen. Der nächste Block ist noch nicht geplant.' : `Ab ${dayLabel(format(addDays(parseISO(block.end), 1), 'yyyy-MM-dd'))}: nächster Block, Plan folgt.`,
  })

  const n = blocks.length
  const note = `${WEEKS[n] ?? `${n} Wochen`} locker: viel Ruhe, Puls unten, bei Schmerzen Pause. Danach beginnt der nächste Block.`
  return { verdict: done ? 'Erholung beendet' : tooMuch ? 'Etwas zu viel' : 'Erholung läuft', lines, note }
}

