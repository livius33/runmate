// Generator step 3 (07-13): workouts. Fills every key slot and key long run of buildDays() with a workout in the plan's
// notes format (lib/plan/structure.ts: "3 ein → 2 × 5 km @ 4:15 (1 km Trab) → 3 aus"), so cards, calendar, fitSession
// and the engine read generated plans unchanged. Never changes a day's date, type or km. Rules:
// methodologies/research/workouts-and-intensity.md (1.2 budget, 2.2 menus, 2.3 race-pace timing, 3 caps), long-run.md 3.2
// (race pace in long runs, tests), phases-and-taper.md 2.3 rules 3 and 5, paces.md 2 (HR hints from lib/analytics/hr.ts).
// Pure.
import { addDays, format, parseISO } from 'date-fns'
import type { Distance, WorkoutKind } from '../methodology/schema'
import type { Phase } from '../methodology/describe'
import { SAFETY } from '../methodology/safety'
import { hrZones, raceHr } from '@/lib/analytics/hr'
import { athlete } from '@/lib/athlete'
import type { PlanSession } from '../types'
import type { DaysPlan } from './days'
import type { Skeleton } from './skeleton'
import { RACE_KM, fmtPace, trainingPaces, type Paces, type PacesInput } from './paces'

export interface WorkoutsInput extends PacesInput { raceDate: string; raceName?: string }
export interface WorkoutPlan { ok: true; sessions: PlanSession[]; paces: Paces; warnings: string[] }

// Code constants named by the research (until the schema gaps G-4, G-17, G-18 become template fields).
export const WORKOUT_RULES = {
  raceSpecificWeeks: { marathon: 12, half: 8, '10k': 10 } as Record<Distance, number>,   // workouts-and-intensity 2.3
  longPaceWeeks: { marathon: 10, half: 6, '10k': 0 } as Record<Distance, number>,        // long-run 3.2
  testWeeks: { marathon: 4, half: 3, '10k': 3 } as Record<Distance, number>,             // weeks before race week
  lastHardDays: { marathon: 8, half: 6, '10k': 5 } as Record<Distance, number>,          // phases-and-taper 2.4
  reminder: { marathon: { reps: 3, km: 2 }, half: { reps: 2, km: 2 }, '10k': { reps: 3, km: 1 } } as Record<Distance, { reps: number; km: number }>,
  cap: { threshold: 0.1, vo2: 0.08, vo2Km: 10, marathonPace: 0.2, marathonPaceKm: 29 },  // Daniels, workouts-and-intensity 3
  longBlock: { share: 0.2, km: 29, easyKm: 4 },
  recoveryShare: 0.7,
  taperShare: 0.55,
  warmCoolMinKm: 3,
  easyTimeMin: 0.75,
}

const W = WORKOUT_RULES
const SLOT_KINDS: WorkoutKind[] = ['threshold', 'tempo', 'marathon_pace', 'half_marathon_pace', 'progression', 'intervals_vo2', 'hills', 'medium_long']
// What a filled key slot is called on cards and in the calendar; a slot without a workout keeps "Qualität".
const KIND_TITLE: Partial<Record<WorkoutKind, string>> = {
  threshold: 'Schwellenlauf', tempo: 'Tempolauf', marathon_pace: 'Marathontempo', half_marathon_pace: 'Halbmarathontempo',
  progression: 'Steigerungslauf', intervals_vo2: 'Intervalle', hills: 'Bergläufe', medium_long: 'Mittellanger Lauf',
}
const Z1 = () => hrZones()[0]
const Z2 = () => hrZones()[1]
const Z4 = () => hrZones()[3]
const STEP = 0.5
const roundKm = (n: number) => Math.round(n / STEP) * STEP
const floorKm = (n: number) => Math.floor(n / STEP + 1e-9) * STEP
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const plus = (d: string, n: number) => ymd(addDays(parseISO(d), n))

export function buildWorkouts(days: DaysPlan, sk: Skeleton, input: WorkoutsInput): WorkoutPlan | { ok: false; error: string } {
  const t = input.template
  const paces = trainingPaces(input)
  const warnings = [...paces.warnings]
  const sessions = days.sessions.map((s) => ({ ...s }))
  const raceIdx = sk.weeks.length - 1
  const racePace = fmtPace(paces.racePaceS)
  const raceKind: WorkoutKind | null = input.distance === 'marathon' ? 'marathon_pace' : input.distance === 'half' ? 'half_marathon_pace' : null
  const lastHardFrom = plus(input.raceDate, -W.lastHardDays[input.distance])
  const g = t.week.key_gap_days
  const paceOf = (kind: WorkoutKind): number => {
    if (kind === 'threshold' || kind === 'tempo') return paces.paces.threshold
    if (kind === 'intervals_vo2') return paces.paces.intervals_vo2
    if (kind === 'marathon_pace') return paces.paces.marathon_pace
    if (kind === 'half_marathon_pace') return paces.paces.half_marathon_pace
    if (kind === 'progression' || kind === 'long_with_pace') return raceKind ? paces.paces[raceKind] : paces.paces.threshold
    return paces.racePaceS
  }
  const PACED: WorkoutKind[] = ['threshold', 'tempo', 'intervals_vo2', 'marathon_pace', 'half_marathon_pace', 'progression', 'long_with_pace']
  const raceSpecific = (kind: WorkoutKind) => raceKind != null && PACED.includes(kind) && fmtPace(paceOf(kind)) === fmtPace(paces.paces[raceKind])
  const weekIdx = (date: string) => sk.weeks.findIndex((w) => date >= w.start && date <= plus(w.start, 6))
  const inWeek = (i: number) => sessions.filter((s) => weekIdx(s.date) === i)
  const loads = (phase: Phase) => sk.weeks.map((w, i) => (w.phase === phase && (w.kind === 'load' || phase === 'taper') && i < raceIdx ? i : -1)).filter((i) => i >= 0)
  // Progression from → to over the phase's load weeks; recovery weeks 0,70 × the last load value.
  const valueAt = (e: { from: number; to: number }, i: number) => {
    const w = sk.weeks[i]
    const ls = loads(w.phase)
    const p = w.kind === 'load' || w.phase === 'taper' ? ls.indexOf(i) : ls.filter((x) => x < i).length - 1
    const v = e.from + (e.to - e.from) * (ls.length > 1 ? Math.max(0, p) / (ls.length - 1) : 0)
    return w.kind === 'load' || w.phase === 'taper' ? v : v * W.recoveryShare
  }
  const isHardAt = (date: string) => sessions.some((s) => s.date === date && s.type !== 'race'
    && (s.key || (s.type === 'long' && (s.km ?? 0) >= SAFETY.longRunMinKmForHard)))
  const spacingOk = (date: string) => Array.from({ length: 2 * Math.max(g, 2) - 1 }, (_, k) => k - Math.max(g, 2) + 1)
    .every((k) => k === 0 || !isHardAt(plus(date, k)))

  // Structured notes: warm-up 60 %, cool-down 40 % of what is not quality or recovery jog.
  const structured = (s: PlanSession, reps: number, repKm: number, recKm: number, paceS: number, hint: string, longWords = false) => {
    const q = reps * repKm
    const rest = (s.km ?? 0) - q - (reps - 1) * recKm
    const cool = longWords ? Math.max(1, Math.min(3, roundKm(rest * 0.3))) : Math.max(1, roundKm(rest * 0.4))
    const warm = rest - cool
    const block = reps > 1 ? `${reps} × ${num(repKm)} km` : `${num(q)} km`
    const rec = reps > 1 ? ` (${num(recKm)} km Trab)` : ''
    s.pace = fmtPace(paceS)
    s.notes = `${num(warm)} ${longWords ? 'locker' : 'ein'} → ${block} @ ${s.pace}${rec} → ${num(cool)} ${longWords ? 'ausrollen' : 'aus'}. ${hint}`.trim()
  }
  const easyNotes = (s: PlanSession, extra = '') => {
    if (s.type === 'recovery') s.notes = `Regeneration, sehr locker: Puls unter ${Z1().max}.${extra}`
    else if (s.type === 'long') s.notes = `Ruhig, Puls ≤ ${Z2().max}.${(s.km ?? 0) >= SAFETY.longRunMinKmForHard ? ' Verpflegung üben.' : ''}${extra}`
    else if (s.title === 'Shakeout') s.notes = 'Locker mit 3 × 20 s Steigerungen.'
    else s.notes = `Locker, Puls ≤ ${Z2().max}.${extra}`
    delete s.pace
    // A quality slot made easy is an easy run (07-21, audit finding 14): not 'tempo', not key.
    if (s.type === 'tempo' || s.type === 'intervals') { s.type = 'easy'; s.key = false; s.title = 'Locker' }
  }
  // A key slot without a fitting workout becomes an easy run with strides — type and key flag too, so the engine and the
  // week review do not treat it as hard (logic audit 2026-10-26, finding 14).
  const relaxed = (s: PlanSession, why: string) => {
    s.notes = `Locker mit 4 × 20 s Steigerungen – ${why}. Puls ≤ ${Z2().max}.`; delete s.pace
    s.type = 'easy'; s.key = false; s.title = 'Locker mit Steigerungen'
  }
  const hintOf = (kind: WorkoutKind) => kind === 'threshold' || kind === 'tempo' ? `Schwelle: Puls ${Z4().min}–${Z4().max}.`
    : kind === 'intervals_vo2' ? 'VO2max: zügig, in der Trabpause ganz ruhig.'
    : kind === 'marathon_pace' ? `Marathontempo, Puls unter ${athlete().raceHrCap}.`
    : kind === 'half_marathon_pace' ? 'HM-Tempo, gleichmäßig.' : 'Gleichmäßig steigern.'
  const capOf = (kind: WorkoutKind, weekKm: number) => Math.min(SAFETY.qualityKmPerSessionMax * weekKm,
    kind === 'threshold' || kind === 'tempo' ? W.cap.threshold * weekKm
      : kind === 'intervals_vo2' ? Math.min(W.cap.vo2 * weekKm, W.cap.vo2Km)
      : kind === 'marathon_pace' && input.distance === 'marathon' ? Math.min(W.cap.marathonPace * weekKm, W.cap.marathonPaceKm) : Infinity)

  for (const s of sessions) if (!s.key && s.type !== 'race' && s.type !== 'rest') easyNotes(s)

  // 1 · Tests: Generalprobe (peak list) and Finaler Test (taper list), on the long run when it is long enough.
  const placeTest = (name: 'Generalprobe' | 'Finaler Test', entry: { to: number } | undefined, idx: number) => {
    if (!entry || idx < 0 || idx >= raceIdx) return
    const wk = inWeek(idx)
    const long = wk.find((s) => s.type === 'long')
    const slot = wk.find((s) => s.key && s.type === 'tempo')
    const onLong = long && (long.km ?? 0) - W.warmCoolMinKm >= 0.75 * entry.to && long.date < lastHardFrom && (long.key || spacingOk(long.date))
    const s = onLong ? long : slot && slot.date < lastHardFrom ? slot : null
    // A day too short for warm-up, 1 km at race pace and cool-down (a low day limit) takes no test.
    const q = s ? floorKm(Math.min(entry.to, (s.km ?? 0) - W.warmCoolMinKm)) : 0
    if (!s || q < 1) { warnings.push(`${name} passt in KW ${sk.weeks[idx].kw} auf keinen Tag.`); return }
    // A test on a long run that was easy adds a hard day: the last key slot before it becomes an easy run.
    if (s === long && !long.key) {
      const before = wk.filter((x) => x.key && x.type === 'tempo' && x.date < long.date).pop()
      if (before) { before.key = false; easyNotes(before, ` Frische für die ${name}.`) }
    }
    s.key = true
    s.test = name
    structured(s, 1, q, 0, paces.racePaceS, `${name}: alles wie am Renntag (Start, Schuhe, Verpflegung). Puls unter ${raceHr(RACE_KM[input.distance]).cap} → Ziel halten.`)
  }
  const testIdx = (() => {
    for (let i = raceIdx - W.testWeeks[input.distance]; i >= 0; i--) if (sk.weeks[i].kind === 'load' && sk.weeks[i].phase !== 'taper') return i
    return -1
  })()
  placeTest('Generalprobe', t.workouts.peak.find((e) => e.kind === 'test'), testIdx)
  placeTest('Finaler Test', t.workouts.taper.find((e) => e.kind === 'test'), sk.weeks.findIndex((w) => w.phase === 'taper'))

  // 2 · Key slots and key long runs, week by week.
  const longBlocks: boolean[] = []
  let prevBlock = 0
  for (let i = 0; i < sk.weeks.length; i++) {
    const w = sk.weeks[i]
    const wk = inWeek(i)
    if (i === raceIdx) {
      const s = wk.find((x) => x.key && x.type !== 'race')
      if (s) {
        let { reps, km } = W.reminder[input.distance]
        while (reps > 1 && (s.km ?? 0) - reps * km - (reps - 1) * STEP < W.warmCoolMinKm) reps--
        if ((s.km ?? 0) - reps * km >= W.warmCoolMinKm) { structured(s, reps, km, STEP, paces.racePaceS, 'Renntempo-Erinnerung, locker bleiben.'); s.title = 'Renntempo kurz' }
        else relaxed(s, 'Rennwoche')
      }
      continue
    }
    const weeksBefore = raceIdx - i
    const list = w.phase === 'taper' && t.workouts.taper.some((e) => SLOT_KINDS.includes(e.kind)) ? t.workouts.taper : t.workouts[w.phase === 'taper' ? 'peak' : w.phase]
    const scale = w.phase === 'taper' && list === t.workouts.peak ? W.taperShare : 1
    const menu = SLOT_KINDS.flatMap((k) => list.filter((e) => e.kind === k))
      .filter((e) => !raceSpecific(e.kind) || weeksBefore <= W.raceSpecificWeeks[input.distance])
    const slots = wk.filter((s) => s.key && s.type === 'tempo' && !s.test).sort((a, b) => a.date.localeCompare(b.date))
    const pos = Math.max(0, loads(w.phase).filter((x) => x <= i).length - 1)

    // Long run with race pace (long-run 3.2): window, template kind, ≤ 2 of 3 in a row, never twice at the maximum.
    const long = wk.find((s) => s.type === 'long')
    let block = 0
    let blockEntry: { from: number; to: number } | undefined
    if (long?.key && !long.test && !t.week.long_run.race_pace) long.key = false   // template keeps long runs aerobic
    if (long?.key && !long.test) {
      blockEntry = list.find((e) => e.kind === 'long_with_pace') ?? (w.phase === 'peak' && raceKind ? list.find((e) => e.kind === raceKind) : undefined)
      const twoBefore = longBlocks[i - 1] && longBlocks[i - 2]
      if (blockEntry && weeksBefore <= W.longPaceWeeks[input.distance] && w.kind === 'load' && !twoBefore) {
        const max = Math.min(blockEntry.to, W.longBlock.share * w.km, W.longBlock.km, (long.km ?? 0) - W.longBlock.easyKm)
        block = floorKm(Math.min(valueAt(blockEntry, i) * scale, max))
        if (prevBlock > 0 && block >= prevBlock && prevBlock >= floorKm(max)) block = Math.max(0, prevBlock - 2)
      }
      if (block < 2) { long.key = false; block = 0 }
    }
    longBlocks[i] = block > 0 || !!long?.test
    if (block > 0) prevBlock = block

    // Quality per slot, then the weekly budget (moderate + hard) × week km scales everything down together.
    const plan = slots.map((s, j) => {
      const e = menu.length ? menu[(j + pos) % menu.length] : undefined
      if (!e || s.date >= lastHardFrom) return { s, e: undefined, q: 0 }
      let v = valueAt(e, i) * scale
      if (e.unit === 'minutes') v = (v * 60) / paceOf(e.kind)
      if (e.kind === 'hills' || e.kind === 'medium_long') return { s, e, q: v }
      const q = Math.min(v, capOf(e.kind, w.km), (s.km ?? 0) - W.warmCoolMinKm)
      return { s, e, q }
    })
    const it = t.intensity[w.phase]
    const budget = (it.moderate + it.hard) * w.km
    const used = plan.reduce((a, x) => a + (x.e && x.e.kind !== 'hills' && x.e.kind !== 'medium_long' ? x.q : 0), 0) + block
    const f = used > budget && used > 0 ? budget / used : 1
    if (f < 1 && block > 0) {
      block = floorKm(block * f)
      if (block < 2) { block = 0; long!.key = false; longBlocks[i] = !!long?.test }
    }
    if (block > 0 && long) structured(long, 1, block, 0, paces.racePaceS, 'Renntempo am Ende, Verpflegung wie am Renntag.', true)
    else if (long && !long.test) easyNotes(long)

    for (const { s, e, q: q0 } of plan) {
      if (!e) { relaxed(s, s.date >= lastHardFrom ? 'Frische vor dem Rennen' : 'keine passende Einheit in der Vorlage'); continue }
      s.title = KIND_TITLE[e.kind] ?? s.title
      if (e.kind === 'hills') { s.notes = `${num(s.km ?? 0)} km locker, darin ${Math.round(q0)} × 45 s zügig bergauf, locker zurück.`; delete s.pace; continue }
      if (e.kind === 'medium_long') { s.notes = `Mittellanger Lauf, ruhig: Puls ≤ ${Z2().max}.`; delete s.pace; continue }
      const q = floorKm(q0 * f)
      const paceS = paceOf(e.kind)
      if (q < 1) { relaxed(s, 'zu kurz für eine Qualitätseinheit'); continue }
      if (e.kind === 'intervals_vo2') {
        let reps = Math.max(1, Math.floor(q))
        while (reps > 1 && (s.km ?? 0) - reps - (reps - 1) * STEP < W.warmCoolMinKm) reps--
        structured(s, reps, reps > 1 ? 1 : q, STEP, paceS, hintOf(e.kind))
      } else if (q > (e.kind === 'threshold' || e.kind === 'tempo' ? 6 : 8)) {
        const reps = q <= 10 ? 2 : 3
        let repKm = Math.floor(q / reps)
        while (repKm > 1 && (s.km ?? 0) - reps * repKm - (reps - 1) < W.warmCoolMinKm) repKm--
        structured(s, reps, repKm, 1, paceS, hintOf(e.kind))
      } else structured(s, 1, q, 0, paceS, hintOf(e.kind))
    }

    // Strides on the easy run two days before the long run when the phase's menu has strides.
    const strides = list.find((e) => e.kind === 'strides')
    if (strides && long) {
      const target = wk.find((s) => s.date === plus(long.date, -2) && s.type === 'easy' && !s.key)
        ?? wk.filter((s) => s.type === 'easy' && !s.key && s.date < long.date).pop()
      if (target) easyNotes(target, ` Dazu ${Math.round(valueAt(strides, i))} × 20 s Steigerungen.`)
    }

    // Easy share by time (workouts-and-intensity 1.2): a warning only.
    const time = wk.reduce((a, s) => {
      if (s.type === 'rest' || s.type === 'race') return a
      const q = s.pace ? qualityOf(s) : 0
      const p = s.pace ? Number(s.pace.split(':')[0]) * 60 + Number(s.pace.split(':')[1]) : 0
      return { easy: a.easy + ((s.km ?? 0) - q) * paces.paces.easy, all: a.all + ((s.km ?? 0) - q) * paces.paces.easy + q * p }
    }, { easy: 0, all: 0 })
    if (time.all > 0 && time.easy / time.all < W.easyTimeMin) warnings.push(`KW ${w.kw}: zu wenig lockerer Umfang (${Math.round((time.easy / time.all) * 100)} % nach Zeit).`)
  }
  return { ok: true, sessions, paces, warnings }
}

function qualityOf(s: PlanSession) {
  const m = s.notes?.match(/→\s*(?:(\d+(?:,\d+)?)\s*×\s*)?(\d+(?:,\d+)?)\s*km\s*@/)
  if (!m) return 0
  const n = (x?: string) => (x ? Number(x.replace(',', '.')) : 1)
  return n(m[1]) * n(m[2])
}
