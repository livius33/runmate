// Grundlage (07-17): is the rolling base block going as planned, and what comes next? Same card shape as Rennbereitschaft
// and Erholung (verdict + one rated line per criterion). Pure and rule-based.
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { activeBlock, blocks, weekOf } from '@/lib/plan/blocks'
import { fmtKm } from '@/lib/plan/format'
import type { PlanSession } from '@/lib/plan/types'
import type { DatedRun } from '@/lib/plan/pace-check'
import type { ReadinessLine } from './readiness'

export type BaseVerdict = 'Grundlage läuft' | 'Mehr als geplant'
const OVER_SHARE = 1.1     // up to 10 % more than planned is fine
const OVER_KM = 2

export const BASE_NOTE = 'Grundlage: Umfang auf dem Niveau der letzten Wochen, höchstens 5 % mehr pro Woche, eine Schlüsseleinheit, jede vierte Woche leichter – bis der nächste Zielblock beginnt.'

export function baseStatus({ today, sessions, runs }: { today: string; sessions: PlanSession[]; runs: DatedRun[] }): { verdict: BaseVerdict; lines: ReadinessLine[] } {
  const lines: ReadinessLine[] = []
  const week = weekOf(today)
  let tooMuch = false
  if (week) {
    const ranToday = runs.some((r) => r.date === today)
    const planned = sessions.filter((s) => s.date >= week.start && (s.date < today || (s.date === today && ranToday)))
      .reduce((t, s) => t + (s.type === 'rest' ? 0 : s.km ?? 0), 0)
    const done = runs.filter((r) => r.date >= week.start && r.date <= today).reduce((t, r) => t + r.km, 0)
    tooMuch = done > planned * OVER_SHARE + OVER_KM
    lines.push({ tone: tooMuch ? 'warn' : 'ok', label: 'Umfang',
      text: `${week.focus.replace(/ \([^)]*\)$/, '')}: ${fmtKm(done)} von ${fmtKm(planned)} km bisher (Woche ${fmtKm(week.km)} km)${tooMuch ? '. Mehr als geplant: die Grundlage ist kein Aufbau.' : '.'}` })
  }
  const next = blocks().find((b) => !b.base && b.planStart > today)
  const block = activeBlock(today)
  lines.push(next
    ? { tone: 'open', label: 'Danach', text: `${next.race.name}: Block ab ${format(parseISO(next.planStart), 'EEEEEE d. MMMM', { locale: de })}.` }
    : { tone: 'open', label: 'Danach', text: `Noch kein nächster Block. Die Grundlage plant immer 4 Wochen voraus (bis ${format(parseISO(block.end), 'd. MMMM', { locale: de })}).` })
  return { verdict: tooMuch ? 'Mehr als geplant' : 'Grundlage läuft', lines }
}
