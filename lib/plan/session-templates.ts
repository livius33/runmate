// Session editor (07-08): what a day *is* — rest, easy, recovery, strides, threshold, intervals, race pace, long run, long
// run with a race-pace block. Workout text in the parseStructure format (fitSession keeps it matching the km), paces from
// the block (frozen at go-live or written into a plan file). Checked against the fixed safety limits only. Pure.
import { blockPaces, weekOf, type PaceName } from './blocks'
import { formatNotes, parseStructure, type Structure } from './structure'
import { fmtKm, paceToS } from './format'
import { SAFETY } from './methodology/safety'
import { restDay } from './effective'
import type { PlanSession } from './types'

export type EditKind = 'rest' | 'easy' | 'recovery' | 'strides' | 'threshold' | 'intervals' | 'race_pace' | 'long' | 'long_rp'

export const EDIT_KINDS: { kind: EditKind; label: string; pace: PaceName | null; minKm: number }[] = [
  { kind: 'rest', label: 'Ruhetag', pace: null, minKm: 0 },
  { kind: 'easy', label: 'Locker', pace: null, minKm: 3 },
  { kind: 'recovery', label: 'Regeneration', pace: null, minKm: 3 },
  { kind: 'strides', label: 'Steigerungen', pace: null, minKm: 5 },
  { kind: 'threshold', label: 'Schwelle', pace: 'threshold', minKm: 7 },
  { kind: 'intervals', label: 'Intervalle', pace: 'intervals_vo2', minKm: 7 },
  { kind: 'race_pace', label: 'Renntempo', pace: 'race', minKm: 7 },
  { kind: 'long', label: 'Longrun', pace: null, minKm: 12 },
  { kind: 'long_rp', label: 'Longrun mit Renntempo', pace: 'race', minKm: 16 },
]

const half = (n: number) => Math.round(n * 2) / 2
const r1 = (n: number) => Math.round(n * 10) / 10

const struct = (warmKm: number, reps: number, repKm: number, pace: string, recKm: number, coolKm: number, suffix: string,
  words: { warm: string; cool: string; rec: string } = { warm: 'ein', cool: 'aus', rec: 'Trab' }): Structure => ({
  prefix: '', warmKm, warmWord: words.warm, reps, repKm, pace, recKm, recWord: words.rec, coolKm: r1(coolKm), coolWord: words.cool, suffix,
})

function qualityNotes(kind: EditKind, km: number, pace: string): string {
  const [w, c] = km >= 12 ? [3, 2] : [2, 1.5]
  const q = km - w - c
  if (kind === 'intervals') {
    const reps = Math.max(3, Math.min(8, Math.floor((q + 0.4) / 1.4)))
    return formatNotes(struct(w, reps, 1, pace, 0.4, km - w - (reps + (reps - 1) * 0.4), '. Gleichmäßig, letzte Wiederholung so schnell wie die erste.', { warm: 'ein', cool: 'aus', rec: 'Trabpause' }))
  }
  if (kind === 'threshold' && q > 6) {
    const reps = q > 13 ? 3 : 2
    const repKm = Math.floor((q - (reps - 1)) / reps)
    return formatNotes(struct(w, reps, repKm, pace, 1, km - w - (reps * repKm + reps - 1), '. Kontrolliert, nicht am Anschlag.'))
  }
  const block = half(q)
  return formatNotes(struct(w, 1, block, pace, 0, km - w - block, kind === 'threshold' ? '. Kontrolliert, nicht am Anschlag.' : '. Gleichmäßig im Renntempo.'))
}

export function editSession(kind: EditKind, km: number, date: string, pace?: string): PlanSession {
  const p = blockPaces(date)
  const at = (name: PaceName) => pace || p[name]
  switch (kind) {
    case 'rest': return restDay(date, 'Von dir auf Ruhetag gesetzt.')
    case 'easy': return { date, type: 'easy', km, title: 'Lockerer Lauf', notes: 'Zone 2' }
    case 'recovery': return { date, type: 'recovery', km, title: 'Sehr lockerer Lauf', notes: 'Locker, Puls unten.' }
    case 'strides': return { date, type: 'easy', km, title: 'Lockerer Lauf mit Steigerungen', notes: 'Mit 6 Steigerungen' }
    case 'threshold': return { date, type: 'tempo', km, title: 'Schwelle', pace: at('threshold'), key: true, notes: qualityNotes(kind, km, at('threshold')) }
    case 'intervals': return { date, type: 'intervals', km, title: 'Intervalle', pace: at('intervals_vo2'), key: true, notes: qualityNotes(kind, km, at('intervals_vo2')) }
    case 'race_pace': return { date, type: 'tempo', km, title: 'Renntempo', pace: at('race'), key: true, notes: qualityNotes(kind, km, at('race')) }
    case 'long': return { date, type: 'long', km, title: 'Longrun', notes: 'Locker und gleichmäßig, Verpflegung üben.' }
    case 'long_rp': {
      const warm = half(km * 0.35), block = half(km * 0.4)
      return {
        date, type: 'long', km, title: 'Longrun mit Renntempo', pace: at('race'), key: true,
        notes: formatNotes(struct(warm, 1, block, at('race'), 0, km - warm - block, '. Verpflegung wie am Renntag.', { warm: 'locker', cool: 'ausrollen', rec: 'Trab' })),
      }
    }
  }
}

// km of the quality part of an edited session (reps × rep length).
export function editQualityKm(s: PlanSession) {
  const st = s.type === 'easy' || s.type === 'recovery' || s.type === 'rest' ? null : parseStructure(s.notes)
  return st ? st.reps * st.repKm : 0
}

// German error, or null. `sessions` = the effective plan (the week total is counted with the edited day).
export function editError(kind: EditKind, km: number, date: string, sessions: PlanSession[], pace?: string): string | null {
  const day = sessions.find((s) => s.date === date)
  if (day?.anchor || day?.type === 'race') return 'Rennen und feste Termine lassen sich hier nicht ändern.'
  if (kind === 'rest') return null
  const def = EDIT_KINDS.find((k) => k.kind === kind)!
  if (!Number.isFinite(km) || km <= 0) return 'Bitte km angeben.'
  if (km < def.minKm) return `${def.label}: mindestens ${fmtKm(def.minKm)} km.`
  if (km > SAFETY.longRunKmMax) return `Höchstens ${SAFETY.longRunKmMax} km an einem Tag.`
  if (pace != null && pace !== '' && !/^\d:[0-5]\d$/.test(pace)) return 'Tempo als m:ss eingeben, z. B. 4:15.'
  if (pace && (paceToS(pace) < 150 || paceToS(pace) > 480)) return 'Das Tempo muss zwischen 2:30 und 8:00 liegen.'
  const week = weekOf(date)
  if (!week) return null
  const s = editSession(kind, km, date, pace)
  const weekKm = sessions.filter((x) => x.date >= week.start && x.date <= week.end && x.date !== date && x.type !== 'rest')
    .reduce((t, x) => t + (x.km ?? 0), 0) + km
  const q = editQualityKm(s)
  if (q > SAFETY.qualityKmPerSessionMax * weekKm) {
    return `Der schnelle Teil (${fmtKm(q)} km) wäre mehr als ${Math.round(SAFETY.qualityKmPerSessionMax * 100)} % der Woche (${fmtKm(r1(weekKm))} km). Weniger km oder eine kürzere Einheit wählen.`
  }
  if (s.type === 'long' && km > SAFETY.longRunShareMax * weekKm) {
    return `Der Longrun wäre mehr als ${Math.round(SAFETY.longRunShareMax * 100)} % der Woche (${fmtKm(r1(weekKm))} km).`
  }
  return null
}
