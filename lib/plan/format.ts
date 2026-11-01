// Formatting and small plan helpers, the same for every block.
import type { PlanSession } from './types'
import { blockPaces, raceOf } from './blocks'

// German decimal comma: 16,5
export function fmtKm(km: number) {
  return km.toLocaleString('de-DE', { maximumFractionDigits: 1 })
}

export function fmtPace(s: number) {
  const r = Math.round(s)
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

// Clock time, 'h:mm' or 'h:mm:ss'
export function fmtClock(s: number, withSeconds = false) {
  const r = Math.round(s)
  const h = Math.floor(r / 3600)
  const m = String(Math.floor((r % 3600) / 60)).padStart(2, '0')
  return withSeconds ? `${h}:${m}:${String(r % 60).padStart(2, '0')}` : `${h}:${m}`
}

export function fmtDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`
}

// Rough duration: quality km at target pace, the rest at the block's easy pace.
export function estimateDurationS(s: PlanSession) {
  if (!s.km) return 0
  const easy = paceToS(blockPaces(s.date).easy)
  if (s.type === 'race') return raceOf(s.date).goalS
  const quality = s.pace ? qualityKm(s) : 0
  const paceS = s.pace ? Number(s.pace.split(':')[0]) * 60 + Number(s.pace.split(':')[1]) : easy
  return quality * paceS + (s.km - quality) * easy
}

// km of the quality part, from the notes: 'N × M km' or 'N km @ …'
export function qualityKm(s: PlanSession) {
  const reps = s.notes?.match(/(\d+)\s*×\s*(\d+)\s*km/)
  if (reps) return Number(reps[1]) * Number(reps[2])
  const block = s.notes?.match(/(\d+(?:,\d+)?)\s*km\s*@/)
  return block ? Number(block[1].replace(',', '.')) : 0
}

// '4:23' → 263
export function paceToS(pace: string) {
  const [m, s] = pace.split(':').map(Number)
  return m * 60 + (s || 0)
}
