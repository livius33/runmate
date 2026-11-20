// Fortschritt im Block (07-27): the numbers behind the progress charts on the Analyse page, per training block.
// Pure — no database, no dates "now": the caller passes the block, the effective plan, the block's runs and today.
// Every takeaway is a fixed rule in German; no AI text.
import { hrZones, isRacePaceWork, raceHr } from './hr'
import type { RunType } from './run-metrics'
import type { PlanSession, PlanWeek, TrainingBlock } from '@/lib/plan/types'
import { fmtKm, fmtPace, paceToS, qualityKm } from '@/lib/plan/format'
import { blockAttempted, checkPace, matchSessionRuns, type DatedRun, type PaceVerdict } from '@/lib/plan/pace-check'

export interface ProgressSplit { km: number; distM: number; paceS: number; hr: number | null; gainM: number }
export interface ProgressRun {
  id: string
  date: string
  km: number
  paceS: number | null
  avgHr: number | null
  type: RunType
  splits: ProgressSplit[]
}

export type Tone = 'good' | 'neutral' | 'warn' | 'bad'
export interface Takeaway { text: string; tone: Tone }

export interface ProgressWeek {
  key: string            // Monday — unique across a year boundary, unlike kw
  kw: number
  start: string
  end: string
  label: string          // 'KW 42'
  phase: string
  easy: boolean          // recovery week inside the load (cutback / light)
  current: boolean
  started: boolean
  planKm: number
  actualKm: number | null      // null until the week has started
  cumPlanKm: number
  cumActualKm: number | null
  longPlanKm: number | null    // the week's planned long run = its longest session
  longPlanDate: string | null
  longActualKm: number | null  // longest run of the week so far
  z2PaceS: number | null       // median pace of the week's clean Zone-2 km
  z2Km: number
}

export interface Phase { label: string; from: number; to: number }   // week indices, inclusive

export interface QualityPoint {
  date: string
  ranOn: string | null
  title: string
  targetS: number
  actualS: number | null
  deltaS: number | null
  hr: number | null
  verdict: PaceVerdict
  racePace: boolean      // race-pace work (else threshold / intervals, faster than race pace)
  attempted: boolean
  km: number             // quality km of the session
}

export interface BlockProgress {
  weeks: ProgressWeek[]
  phases: Phase[]
  raceWeek: number | null        // index of the week with the race
  race: { date: string; name: string; distanceKm: number; goalPaceS: number; hrCap: number }
  volume: Takeaway & { planToDateKm: number; actualToDateKm: number; pct: number | null; weeksStarted: number }
  z2: Takeaway & { firstPaceS: number | null; lastPaceS: number | null; deltaS: number | null }
  long: Takeaway & { longestKm: number | null; longestDate: string | null; planned: number; done: number }
  quality: Takeaway & { points: QualityPoint[] }
}

export const Z2_MIN_KM_PER_WEEK = 4     // fewer clean Zone-2 km than this: no point for the week
export const Z2_MAX_GAIN_M = 20         // a km with more climb than this is not a clean pace sample
export const Z2_TREND_S = 5             // s/km change that counts as a trend
export const LONG_DONE_SHARE = 0.9      // longest run ≥ 90 % of the planned long run = done
export const QUALITY_WINDOW = 4         // last N attempted race-pace blocks decide the takeaway
const ON_TARGET_S = 5                   // same as pace-check.ts
const PHASE_LABELS = ['Grundlage', 'Aufbau', 'Spitze', 'Taper']   // generator PHASE_LABEL (lib/plan/generator/days.ts)

const r1 = (n: number) => Math.round(n * 10) / 10
const inWeek = (w: { start: string; end: string }, d: string) => d >= w.start && d <= w.end

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function phaseOf(w: PlanWeek): string {
  if (w.taper) return 'Taper'
  if (w.recovery) return 'Erholung'
  const head = (w.focus ?? '').split('·')[0].trim()
  return PHASE_LABELS.includes(head) ? head : 'Training'
}

export function phasesOf(weeks: { phase: string }[]): Phase[] {
  const out: Phase[] = []
  weeks.forEach((w, i) => {
    const last = out[out.length - 1]
    if (last && last.label === w.phase) last.to = i
    else out.push({ label: w.phase, from: i, to: i })
  })
  return out
}

// A clean Zone-2 kilometre: a full km from km 2 on (km 1 carries the HR lag), flat, with its mean HR inside Zone 2.
// Treadmill pace is not GPS pace and a race is not a steady run: both are left out.
export function z2Splits(run: ProgressRun): ProgressSplit[] {
  if (run.type === 'Laufband' || run.type === 'Rennen') return []
  const z2 = hrZones()[1]
  return run.splits.filter((s) => s.km >= 2 && s.distM >= 950 && s.gainM < Z2_MAX_GAIN_M && s.hr != null && s.hr >= z2.min && s.hr < z2.max && s.paceS > 0)
}

const toDated = (r: ProgressRun): DatedRun => {
  const full = r.splits.filter((s) => s.distM >= 950)
  return { id: r.id, date: r.date, km: r.km, paceS: r.paceS, avgHr: r.avgHr, splitPacesS: full.map((s) => s.paceS), splitHrs: full.map((s) => s.hr) }
}

export function blockProgress({ block, sessions, runs, today }: {
  block: TrainingBlock
  sessions: PlanSession[]
  runs: ProgressRun[]
  today: string
}): BlockProgress {
  const weeks = block.weeks
  const first = weeks[0]?.start ?? block.planStart, last = weeks[weeks.length - 1]?.end ?? block.end
  const race = block.race
  const hrCap = raceHr(race.distanceKm).cap
  const inBlock = sessions.filter((s) => s.date >= first && s.date <= last)
  const raceDays = new Set(inBlock.filter((s) => s.type === 'race').map((s) => s.date))
  const blockRuns = runs.filter((r) => r.date >= first && r.date <= last && r.date <= today)
  const volumeRuns = blockRuns.filter((r) => !raceDays.has(r.date))

  // ── Weeks ──────────────────────────────────────────────────────────────────
  let cumPlan = 0, cumActual = 0
  const out: ProgressWeek[] = weeks.map((w) => {
    const started = w.start <= today
    const wRuns = blockRuns.filter((r) => inWeek(w, r.date))
    const actualKm = started ? r1(volumeRuns.filter((r) => inWeek(w, r.date)).reduce((t, r) => t + r.km, 0)) : null
    cumPlan = r1(cumPlan + w.km)
    if (actualKm != null) cumActual = r1(cumActual + actualKm)
    // The week's long run = its longest planned session (robust to type edits and swaps; the race itself is not training).
    const longPlan = inBlock.filter((s) => inWeek(w, s.date) && s.type !== 'race' && s.type !== 'rest' && s.km).sort((a, b) => b.km! - a.km!)[0] ?? null
    const longActual = wRuns.map((r) => r.km)
    const z2 = wRuns.flatMap(z2Splits)
    return {
      key: w.start, kw: w.kw, start: w.start, end: w.end, label: `KW ${w.kw}`,
      phase: phaseOf(w), easy: !!w.cutback || !!w.light, current: inWeek(w, today), started,
      planKm: w.km, actualKm, cumPlanKm: cumPlan, cumActualKm: actualKm == null ? null : cumActual,
      longPlanKm: longPlan?.km ?? null, longPlanDate: longPlan?.date ?? null,
      longActualKm: longActual.length ? r1(Math.max(...longActual)) : null,
      z2PaceS: z2.length >= Z2_MIN_KM_PER_WEEK ? Math.round(median(z2.map((s) => s.paceS))) : null,
      z2Km: z2.length,
    }
  })
  const raceWeekIdx = weeks.findIndex((w) => inWeek(w, race.date))

  // ── Volume ─────────────────────────────────────────────────────────────────
  // Soll bis heute: finished weeks count their target, the current week its sessions up to today (never above the target).
  // Today counts once it is run, as in the readiness check: nobody is behind plan before the day's run.
  // Session km alone would not do: the history weeks before planStart hold an older plan than the week targets.
  const ranToday = volumeRuns.some((r) => r.date === today)
  const planToDateKm = r1(weeks.filter((w) => w.start <= today).reduce((t, w) => {
    if (w.end < today) return t + w.km
    const sessionKm = inBlock.filter((s) => inWeek(w, s.date) && (s.date < today || (s.date === today && ranToday)) && s.type !== 'race' && s.type !== 'rest').reduce((u, s) => u + (s.km ?? 0), 0)
    return t + Math.min(w.km, sessionKm)
  }, 0))
  const actualToDateKm = r1(volumeRuns.reduce((t, r) => t + r.km, 0))
  const weeksStarted = out.filter((w) => w.started).length
  const pct = planToDateKm > 0 ? Math.round((actualToDateKm / planToDateKm) * 100) : null
  let volume: Takeaway
  if (!weeksStarted || pct == null) volume = { text: `Der Block beginnt am ${fmtDate(first).replace(/\.$/, '')}.`, tone: 'neutral' }
  else {
    const head = `Nach ${weeksStarted} von ${out.length} Wochen: ${fmtKm(actualToDateKm)} von ${fmtKm(planToDateKm)} geplanten km (${pct} %)`
    volume = pct >= 110 ? { text: `${head} – mehr als geplant, auf die Erholung achten.`, tone: 'warn' }
      : pct >= 95 ? { text: `${head} – im Soll.`, tone: 'good' }
      : pct >= 85 ? { text: `${head} – leicht unter Plan.`, tone: 'warn' }
      : { text: `${head} – deutlich unter Plan.`, tone: 'bad' }
  }

  // ── Zone 2 ─────────────────────────────────────────────────────────────────
  const z2Points = out.filter((w) => w.z2PaceS != null).map((w) => w.z2PaceS!)
  let z2: BlockProgress['z2']
  if (z2Points.length < 2) z2 = { text: 'Noch zu wenige Kilometer in Zone 2 für einen Trend.', tone: 'neutral', firstPaceS: z2Points[0] ?? null, lastPaceS: null, deltaS: null }
  else {
    const head = z2Points.length >= 4 ? z2Points.slice(0, 2) : [z2Points[0]]
    const tail = z2Points.length >= 4 ? z2Points.slice(-2) : [z2Points[z2Points.length - 1]]
    const firstPaceS = Math.round(head.reduce((a, b) => a + b, 0) / head.length)
    const lastPaceS = Math.round(tail.reduce((a, b) => a + b, 0) / tail.length)
    const deltaS = lastPaceS - firstPaceS
    const base = { firstPaceS, lastPaceS, deltaS }
    z2 = deltaS <= -Z2_TREND_S ? { ...base, text: `Tempo in Zone 2 von ${fmtPace(firstPaceS)} auf ${fmtPace(lastPaceS)}/km (−${-deltaS} s/km): aerob fitter.`, tone: 'good' }
      : deltaS >= Z2_TREND_S ? { ...base, text: `Tempo in Zone 2 von ${fmtPace(firstPaceS)} auf ${fmtPace(lastPaceS)}/km (+${deltaS} s/km): langsamer bei gleichem Puls – Ermüdung, Hitze oder Gelände?`, tone: 'warn' }
      : { ...base, text: `Tempo in Zone 2 stabil bei etwa ${fmtPace(lastPaceS)}/km.`, tone: 'neutral' }
  }

  // ── Long runs ──────────────────────────────────────────────────────────────
  const longest = blockRuns.reduce<ProgressRun | null>((b, r) => (!b || r.km > b.km ? r : b), null)
  const longPlanned = out.filter((w) => w.longPlanKm != null && w.longPlanDate! <= today)
  const longDone = longPlanned.filter((w) => (w.longActualKm ?? 0) >= LONG_DONE_SHARE * w.longPlanKm!)
  let long: Takeaway
  if (!longPlanned.length) {
    const next = out.find((w) => w.longPlanKm != null)      // planned, but not due yet
    long = { text: longest ? `Längster Lauf im Block: ${fmtKm(longest.km)} km (${fmtDate(longest.date)}).`
      : next ? `Erster Longrun: ${fmtKm(next.longPlanKm!)} km am ${fmtDate(next.longPlanDate!).replace(/\.$/, '')}.` : 'Noch kein Longrun im Block.', tone: 'neutral' }
  }
  else {
    const head = `${longest ? `Längster Lauf: ${fmtKm(longest.km)} km (${fmtDate(longest.date)})` : 'Noch kein Lauf im Block'} · Longruns gelaufen: ${longDone.length} von ${longPlanned.length}`
    const share = longDone.length / longPlanned.length
    long = share >= 0.8 ? { text: `${head} – der Aufbau steht.`, tone: 'good' }
      : share >= 0.5 ? { text: `${head} – Lücken im Aufbau.`, tone: 'warn' }
      : { text: `${head} – der Longrun fehlt zu oft.`, tone: 'bad' }
  }

  // ── Race-pace blocks ───────────────────────────────────────────────────────
  const paced = inBlock.filter((s) => s.pace && s.type !== 'race' && s.type !== 'rest' && s.date <= today)
  const matched = matchSessionRuns(inBlock.filter((s) => s.type !== 'rest' && s.date <= today), blockRuns.map(toDated))
  const points: QualityPoint[] = paced.map((s) => {
    const run = matched.get(s.date) ?? null
    const c = checkPace(s, run)
    return {
      date: s.date, ranOn: run?.date ?? null, title: s.title, targetS: c.targetS, actualS: c.actualS, deltaS: c.deltaS,
      hr: c.blockHr ?? null, verdict: c.verdict, racePace: isRacePaceWork(paceToS(s.pace!), race),
      attempted: c.actualS != null && blockAttempted(s.pace, c.actualS), km: qualityKmOf(s),
    }
  })
  const recent = points.filter((p) => p.racePace && p.attempted && p.deltaS != null).slice(-QUALITY_WINDOW)
  let quality: Takeaway
  if (!recent.length) quality = { text: 'Noch kein Renntempo-Block gelaufen.', tone: 'neutral' }
  else {
    const hits = recent.filter((p) => Math.abs(p.deltaS!) <= ON_TARGET_S).length
    const hrs = recent.map((p) => p.hr).filter((h): h is number => h != null)
    const hr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null
    const { hard } = raceHr(race.distanceKm)
    const n = recent.length
    const head = `Renntempo: ${hits} von ${n} ${n === 1 ? 'Block' : 'letzten Blöcken'} im Ziel`
    const hrText = hr == null ? '' : `, HF Ø ${hr} ${hr <= hrCap ? 'unter' : hr >= hard ? 'deutlich über' : 'über'} ${hrCap}`
    const stable = hits >= Math.ceil(0.75 * n)   // 1/1, 2/2, 3/3, 3/4
    quality = stable && (hr == null || hr <= hrCap) ? { text: `${head}${hrText} – sitzt.`, tone: 'good' }
      : stable ? { text: `${head}${hrText} – Tempo da, aber teuer.`, tone: 'warn' }
      : hits * 2 >= n ? { text: `${head}${hrText} – wird stabiler.`, tone: 'neutral' }
      : { text: `${head}${hrText} – noch nicht stabil.`, tone: 'warn' }
  }

  return {
    weeks: out, phases: phasesOf(out), raceWeek: raceWeekIdx >= 0 ? raceWeekIdx : null,
    race: { date: race.date, name: race.name, distanceKm: race.distanceKm, goalPaceS: race.goalPaceS, hrCap },
    volume: { ...volume, planToDateKm, actualToDateKm, pct, weeksStarted },
    z2,
    long: { ...long, longestKm: longest?.km ?? null, longestDate: longest?.date ?? null, planned: longPlanned.length, done: longDone.length },
    quality: { ...quality, points },
  }
}

// km of the quality part (notes 'N × M km' / 'N km @'), the whole session when the notes name none.
const qualityKmOf = (s: PlanSession) => qualityKm(s) || (s.km ?? 0)

function fmtDate(d: string) {
  const [, m, day] = d.split('-')
  return `${Number(day)}.${Number(m)}.`
}
