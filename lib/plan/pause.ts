// Krank / Pause (07-08): days marked as ill or paused become rest; afterwards the plan returns gradually (research
// adaptation.md §4.2): week 1 easy only, ≤ 70 % of the last load week, no run over 45 min; week 2 ≤ 90 %, threshold
// instead of race pace, long run ≤ 0,8 × the longest before the pause. Nothing is ever added. The numbers are practice
// values, not study results. The block's method may set the shares and what week 2 holds (07-18, research adaptation.md
// §4.3). Pure.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { allWeeks, blockPaces, isEasyWeek } from './blocks'
import { rulesFor } from './rules'
import { fmtKm, paceToS } from './format'
import type { PlanSession } from './types'

export type PauseKind = 'krank' | 'pause'
export interface Pause { id: string; kind: PauseKind; from: string; to: string | null }   // to = null: still open
export interface PauseInput { pauses: Pause[]; today: string }

export const PAUSE_LABEL: Record<PauseKind, string> = { krank: 'Krank', pause: 'Pause' }

export const RETURN_RULES = {
  week1Share: 0.7,        // of the last load week
  week2Share: 0.9,
  week1MaxMin: 45,        // longest single run in week 1, at easy pace
  stridesFromDay: 2,      // strides allowed from R + 2
  longShare: 0.8,         // week-2 long run ≤ 0,8 × the longest run of the 4 weeks before the pause
  lookbackDays: 28,
  recoveryDays: 4,        // a pause this long makes its week a recovery week
  replanDays: 14,         // from here: "Block neu planen"
  minRunKm: 3,
  week2Quality: 'threshold' as 'threshold' | 'easy',   // race pace → threshold; 'easy': no quality in week 2 (strides only)
}
export type ReturnRules = typeof RETURN_RULES
export const returnRules = (date: string): ReturnRules => ({ ...RETURN_RULES, ...rulesFor(date).return })

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const half = (n: number) => Math.floor(n * 2) / 2
const r1 = (n: number) => Math.round(n * 10) / 10
const isRunDay = (s?: PlanSession): s is PlanSession & { km: number } => !!s && s.type !== 'rest' && s.type !== 'race' && (s.km ?? 0) > 0
const fixed = (s?: PlanSession) => !!s && (s.anchor || s.type === 'race')

// Last paused day: the end, or (open pause) today — never before the start.
export const pauseEnd = (p: Pause, today: string) => p.to ?? (today > p.from ? today : p.from)

export interface PauseWindow {
  pause: Pause
  end: string             // last paused day
  returnDay: string       // R
  week1End: string        // R + 6
  until: string           // R + 13: end of the return window
  days: number            // paused days
  loadKm: number          // last load week before the pause (planned)
  week1Km: number
  week2Km: number
  longKm: number          // week-2 long-run cap
  rules: ReturnRules      // of the block the return day belongs to
  replan: boolean
  recoveryWeek: boolean
  raceInPause: boolean
}

export interface PauseLayer { caps: Record<string, PlanSession>; paused: Record<string, PlanSession>; windows: PauseWindow[] }

// The last week before `date` that is neither recovery nor taper (planned km); else the week containing `date`.
function lastLoadWeekKm(date: string) {
  const weeks = allWeeks()
  const before = weeks.filter((w) => w.end < date && !isEasyWeek(w) && !w.taper)
  return (before[before.length - 1] ?? weeks.find((w) => w.start <= date && date <= w.end))?.km ?? 0
}

// Cut a set of days down to a total, longest day first in 0,5-km steps, never below minRunKm (then the shortest
// day becomes rest). Only ever lowers km.
function cutTo(days: (PlanSession & { km: number })[], total: number): Map<string, number> {
  const km = new Map(days.map((s) => [s.date, s.km]))
  const sum = () => [...km.values()].reduce((t, k) => t + k, 0)
  while (sum() > total + 1e-9 && km.size) {
    const [date, k] = [...km].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    if (k - 0.5 >= RETURN_RULES.minRunKm) km.set(date, r1(k - 0.5))
    else {
      const [shortest] = [...km].filter(([, x]) => x > 0).sort((a, b) => a[1] - b[1] || b[0].localeCompare(a[0]))[0] ?? []
      if (!shortest) break
      km.set(shortest, 0)
    }
  }
  return km
}

// `byDate` = the plan after the engine, before manual edits. Pauses must not overlap (the API refuses it).
export function pauseLayer(byDate: Map<string, PlanSession>, { pauses, today }: PauseInput): PauseLayer {
  const caps: Record<string, PlanSession> = {}
  const paused: Record<string, PlanSession> = {}
  const windows: PauseWindow[] = []
  const at = (d: string) => caps[d] ?? byDate.get(d)

  for (const p of [...pauses].sort((a, b) => a.from.localeCompare(b.from))) {
    const end = pauseEnd(p, today)
    const days = differenceInCalendarDays(parseISO(end), parseISO(p.from)) + 1
    let raceInPause = false
    for (let d = p.from; d <= end; d = day(d, 1)) {
      const s = byDate.get(d)
      if (fixed(s)) { raceInPause ||= s!.type === 'race'; continue }
      paused[d] = { date: d, type: 'rest', title: PAUSE_LABEL[p.kind], paused: p.kind,
        notes: p.kind === 'krank' ? 'Krank: kein Training. Mit Fieber wird nicht gelaufen.' : 'Pause: kein Training.' }
    }

    const R = day(end, 1)
    const RR = returnRules(R)
    const loadKm = lastLoadWeekKm(p.from)
    const week1 = Array.from({ length: 7 }, (_, i) => day(R, i))
    const week2 = Array.from({ length: 7 }, (_, i) => day(R, 7 + i))
    const easyPaceS = paceToS(blockPaces(R).easy)
    const maxRun = Math.max(RETURN_RULES.minRunKm, half((RETURN_RULES.week1MaxMin * 60) / easyPaceS))
    const lookback = Array.from({ length: RETURN_RULES.lookbackDays }, (_, i) => byDate.get(day(p.from, -1 - i)))
    const longest = Math.max(0, ...lookback.filter(isRunDay).map((s) => s.km))
    const longKm = half(RR.longShare * longest)
    const { race: racePace, threshold } = blockPaces(R)

    // Week 1: easy only, single runs ≤ 45 min, total ≤ 70 %.
    const w1: (PlanSession & { km: number })[] = []
    for (const d of week1) {
      const s = at(d)
      if (!isRunDay(s) || fixed(s) || paused[d]) continue
      const strides = /Steigerung/.test(`${s.title} ${s.notes ?? ''}`) && d >= day(R, RETURN_RULES.stridesFromDay)
      w1.push({ date: d, type: 'easy', km: Math.min(s.km, maxRun), title: strides ? 'Lockerer Lauf mit Steigerungen' : 'Lockerer Lauf',
        notes: strides ? 'Nach der Pause: locker, mit 4 Steigerungen.' : 'Nach der Pause: locker, Zone 2.' })
    }
    // Week 2: race pace → threshold (or every quality session → easy with strides), long run capped, total ≤ 90 %.
    const w2: (PlanSession & { km: number })[] = []
    for (const d of week2) {
      const s = at(d)
      if (!isRunDay(s) || fixed(s) || paused[d]) continue
      let next: PlanSession & { km: number } = { ...s }
      if (RR.week2Quality === 'easy' && (s.key || s.type === 'tempo' || s.type === 'intervals')) {
        next = { date: d, type: 'easy', km: s.km, title: 'Lockerer Lauf mit Steigerungen', notes: 'Nach der Pause: locker, mit 4 Steigerungen; die Qualität kommt nach der zweiten Woche zurück.' }
      } else if (s.type === 'tempo' && s.pace === racePace) {
        next = { ...next, title: 'Schwelle statt Renntempo', pace: threshold, test: undefined,
          notes: (s.notes ?? '').replaceAll(`@ ${racePace}`, `@ ${threshold}`) + ' Nach der Pause: Schwelle vor Renntempo.' }
      }
      if (s.type === 'long' && longKm > 0 && s.km > longKm) next = { ...next, km: Math.max(RETURN_RULES.minRunKm, longKm) }
      w2.push(next)
    }
    const week1Km = half(RR.week1Share * loadKm)
    const week2Km = half(RR.week2Share * loadKm)
    for (const [list, total] of [[w1, week1Km], [w2, week2Km]] as const) {
      const km = cutTo(list, total)
      for (const s of list) {
        const k = km.get(s.date) ?? s.km
        caps[s.date] = k > 0 ? { ...s, km: k } : { date: s.date, type: 'rest', title: 'Ruhetag', notes: 'Nach der Pause: Umfang reduziert.' }
      }
    }
    windows.push({
      pause: p, end, returnDay: R, week1End: week1[6], until: week2[6], days, loadKm, week1Km, week2Km, longKm, rules: RR,
      replan: days >= RETURN_RULES.replanDays, recoveryWeek: days >= RETURN_RULES.recoveryDays, raceInPause,
    })
  }
  return { caps, paused, windows }
}

// Dates the engine keeps its hands off: the pause itself and the two return weeks.
export function inPauseWindow(date: string, input?: PauseInput) {
  return !!input?.pauses.some((p) => date >= p.from && date <= day(pauseEnd(p, input.today), 14))
}

const dm = (d: string) => format(parseISO(d), 'd.M.')

// "Nach der Krankheit" (research adaptation.md §4.2).
export function returnText(w: PauseWindow): string {
  const what = w.pause.kind === 'krank' ? 'Krankheit' : 'Pause'
  return [
    `Zurück nach ${w.days} ${w.days === 1 ? 'Tag' : 'Tagen'} ${what}, Wiedereinstieg am ${dm(w.returnDay)}.`,
    `Bis ${dm(w.week1End)} höchstens ${fmtKm(w.week1Km)} km (${Math.round(w.rules.week1Share * 100)} % der letzten Belastungswoche), alles locker, kein Lauf über ${w.rules.week1MaxMin} Minuten.`,
    `Bis ${dm(w.until)} höchstens ${fmtKm(w.week2Km)} km, ${w.rules.week2Quality === 'easy' ? 'noch keine Qualität, nur Steigerungen' : 'Schwelle statt Renntempo'}${w.longKm > 0 ? `, Longrun höchstens ${fmtKm(w.longKm)} km` : ''}.`,
    'Verpasste Kilometer werden nicht nachgeholt.',
    ...(w.pause.kind === 'krank' ? ['Mit Fieber wird nicht gelaufen; die erste Schlüsseleinheit frühestens zwei symptomfreie Tage nach dem Wiedereinstieg.'] : []),
    ...(w.raceInPause ? ['Das Rennen liegt in deiner Pause – es bleibt im Plan, entscheide am Morgen selbst.'] : []),
    ...(w.replan ? ['Nach zwei Wochen und mehr: den Block neu planen.'] : []),
    'Grundlage: Konsens-Empfehlungen (IOC 2016, Rückkehr nach Infekten); die Prozentwerte sind Praxiswerte, keine Studienergebnisse.',
  ].join(' ')
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const MAX_BACKDATE_DAYS = 14

// German error, or null when the pause may be saved next to the others. `stored` = a pause that is already saved and
// only gets its end: the backdate limit is for entering a new one.
export function pauseError(p: Pause, others: Pause[], today: string, stored = false): string | null {
  if (p.kind !== 'krank' && p.kind !== 'pause') return 'Bitte Krank oder Pause wählen.'
  if (!ISO.test(p.from) || Number.isNaN(parseISO(p.from).getTime())) return 'Das Startdatum ist ungültig.'
  if (p.to != null && (!ISO.test(p.to) || Number.isNaN(parseISO(p.to).getTime()))) return 'Das Enddatum ist ungültig.'
  if (!stored && p.from < day(today, -MAX_BACKDATE_DAYS)) return `Höchstens ${MAX_BACKDATE_DAYS} Tage rückwirkend.`
  if (p.to != null && p.to < p.from) return 'Das Ende liegt vor dem Start.'
  if (p.to != null && differenceInCalendarDays(parseISO(p.to), parseISO(p.from)) > 90) return 'Höchstens 90 Tage am Stück.'
  const end = (x: Pause) => x.to ?? '9999-12-31'
  const clash = others.find((o) => o.id !== p.id && p.from <= end(o) && o.from <= end(p))
  if (clash) return `Überschneidet sich mit ${PAUSE_LABEL[clash.kind]} ab ${dm(clash.from)}.`
  if (p.to == null && others.some((o) => o.id !== p.id && o.to == null)) return 'Es gibt schon eine offene Pause.'
  return null
}

// What is stored (settings 'plan_pauses'); anything malformed is dropped.
export function storedPauses(raw: unknown): Pause[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((p): p is Pause => !!p && typeof p.id === 'string' && (p.kind === 'krank' || p.kind === 'pause')
    && typeof p.from === 'string' && ISO.test(p.from) && (p.to === null || (typeof p.to === 'string' && ISO.test(p.to))))
}
