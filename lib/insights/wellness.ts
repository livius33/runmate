// The "Erholung" line under Rennbereitschaft and on the post-race Erholung card: the last 7 nights against the
// runner's own baseline. A note, never part of the card's verdict (methodologies/research/modifiers.md §4). Pure.
import {
  MIN_BASELINE_NIGHTS, SHORT_SLEEP_S, fmtSleep, hrvLow, recoveryWeek, rhrHigh, type WellnessNight,
} from '@/lib/analytics/recovery-data'
import type { ReadinessLine } from './readiness'

export const WELLNESS_LABEL = 'Erholung'

export function wellnessLine(nights: WellnessNight[], today: string): ReadinessLine {
  const w = recoveryWeek(nights, today)
  if (!w.nights) return { tone: 'open', label: WELLNESS_LABEL, text: 'keine Schlafdaten der letzten 7 Nächte – Uhr nachts tragen.' }
  const b = w.baseline
  const parts: string[] = []
  const warn: string[] = []
  if (w.sleepS != null) {
    parts.push(`Schlaf Ø ${fmtSleep(w.sleepS)} (${w.sleepNights} ${w.sleepNights === 1 ? 'Nacht' : 'Nächte'})`)
    if (w.sleepS < SHORT_SLEEP_S) warn.push('zu wenig Schlaf')
  }
  if (w.hrv != null) {
    parts.push(`HRV ${w.hrv}${b.hrv != null ? ` (Basis ${b.hrv})` : ''}`)
    if (hrvLow(w.hrv, b)) warn.push('HRV unter deiner Basis')
  }
  if (w.rhr != null) {
    parts.push(`Ruhepuls ${w.rhr}${b.rhr != null ? ` (Basis ${b.rhr})` : ''}`)
    if (rhrHigh(w.rhr, b)) warn.push('Ruhepuls über deiner Basis')
  }
  const base = parts.join(' · ')
  if (warn.length) return { tone: 'warn', label: WELLNESS_LABEL, text: `${base}: ${warn.join(', ')}. Schlaf und lockere Tage zuerst.` }
  if (!b.ready) return { tone: 'open', label: WELLNESS_LABEL, text: `${base}. Basis wird aufgebaut (${b.nights}/${MIN_BASELINE_NIGHTS} Nächte).` }
  return { tone: 'ok', label: WELLNESS_LABEL, text: `${base}: im Rahmen deiner Basis.` }
}
