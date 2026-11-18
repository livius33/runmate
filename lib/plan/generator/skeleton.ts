// Generator step 1 (07-02): the week skeleton — every calendar week from the plan start to race week with its phase,
// km, share of the peak and recovery flag — from a methodology template, the race and the athlete's current and proven
// weekly km. Rules: methodologies/research/peak-and-recovery.md (peak 1.3, text 1.6, recovery 2.2), load-cycles.md
// (rules 1–4, 6) and phases-and-taper.md (phases 1.3, taper 2.3 rules 1, 6, 7). Only template values and SAFETY limits —
// no methodology numbers in here. Pure.
import { addDays, differenceInCalendarDays, format, getISOWeek, parseISO, startOfWeek } from 'date-fns'
import type { Distance, Methodology } from '../methodology/schema'
import type { Phase, PlanLike } from '../methodology/describe'
import { SAFETY } from '../methodology/safety'
import type { Experience } from '../athlete-profile'

export interface SkeletonInput {
  template: Methodology
  distance: Distance
  raceDate: string                 // 'yyyy-MM-dd'
  start: string                    // plan start; the skeleton starts on that week's Monday
  currentKm: number                // B: mean of the last 4 weeks, or the last week of a planned recovery block
  currentKmSource?: 'mean4' | 'recoveryBlock' | 'plan' | 'manual' | 'runs2' | 'return'
  provenKm?: number | null         // P: highest 4-week mean in the last 52 weeks (missing = B)
  peakKm?: number | null           // set by hand (capped by what is reachable, with a warning)
  tuneUps?: string[]               // dates of tune-up races (≥ ½ goal distance or ≥ 15 km — the caller decides)
  experience?: Experience | null
  age?: number | null
}

export type Binding = 'history' | 'time' | 'absolute' | 'template' | 'current'
export type WeekKind = 'load' | 'recovery' | 'tuneup' | 'taper'

export interface SkeletonWeek {
  start: string                    // Monday
  kw: number                       // ISO week
  phase: Phase
  kind: WeekKind
  km: number
  share: number                    // km ÷ peak
  rising: boolean                  // load week ≥ +3 % on the week before
  hold: boolean                    // held at the week before after 3 rising weeks
}

export interface LoadRun { from: string; weeks: number; rising: boolean }   // rising: every week of the run rose

export interface Skeleton {
  ok: true
  weeks: SkeletonWeek[]
  peakKm: number
  peak: { recommendedKm: number; binding: Binding; why: string[] }
  phases: Record<Phase, number>
  runs: LoadRun[]
  warnings: string[]
}
export type SkeletonResult = Skeleton | { ok: false; error: string }

const STEP = 0.5                   // km are planned in 0,5-km steps
const RISING = 1.03                // load-cycles.md: a rising week is ≥ +3 % on the week before
const MIN_TOTAL: Record<Distance, number> = { marathon: 12, half: 8, '10k': 6 }   // shorter → warning "kurzer Aufbau"
const NOVICE = { km: 20, overBase: 1.25, growth: 0.04 }                          // research peak-and-recovery.md 1.3
const MASTERS = { age: 50, every: 3 }                                             // research peak-and-recovery.md 2.2
const MAX_START_SHARE = 0.9
const BUILD_PHASES = ['base', 'build', 'peak'] as const
const PHASE_LABEL: Record<Phase, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' }
const DISTANCE: Record<Distance, string> = { marathon: 'einen Marathon', half: 'einen Halbmarathon', '10k': 'einen 10-km-Lauf' }

const roundKm = (n: number) => Math.round(n / STEP) * STEP
const floorKm = (n: number) => Math.floor(n / STEP + 1e-9) * STEP
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const monday = (d: string) => ymd(startOfWeek(parseISO(d), { weekStartsOn: 1 }))
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
const pct = (n: number) => `${Math.round(n * 100)} %`
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// Weekly km after `weeks` weeks of net growth: nR while below the proven volume P, n above it.
function climb(B: number, P: number, weeks: number, n: number, nR: number) {
  let k = B
  for (let i = 0; i < weeks; i++) k *= 1 + (k < P ? nR : n)
  return k
}

// Phases from the weeks available (phases-and-taper.md 1.3): largest-remainder split, then minimums by protection order.
function allocate(N: number, t: Methodology, distance: Distance) {
  const split = t.phases.split
  const raw = BUILD_PHASES.map((p) => N * split[p])
  const c = raw.map(Math.floor)
  BUILD_PHASES.map((_, i) => i).sort((a, b) => (raw[b] - c[b]) - (raw[a] - c[a]) || a - b)
    .slice(0, N - c.reduce((a, b) => a + b, 0)).forEach((i) => c[i]++)
  const counts = { base: c[0], build: c[1], peak: c[2] }
  const min = t.phases.min_weeks[distance]
  const order = t.phases.shorten_order
  const warnings: string[] = []
  if (N < min.base + min.build + min.peak) {
    let left = N
    for (const p of [...order].reverse()) { counts[p] = Math.min(min[p], left); left -= counts[p] }
    warnings.push(`Zu kurz für alle Phasen: ${BUILD_PHASES.map((p) => `${PHASE_LABEL[p]} ${counts[p]}`).join(', ')} Wochen.`)
  } else {
    for (const p of [...order].reverse()) {
      while (counts[p] < min[p]) {
        const donor = order.find((q) => q !== p && counts[q] > min[q])!
        counts[donor]--
        counts[p]++
        if (counts[donor] === min[donor]) warnings.push(`Phase ${PHASE_LABEL[donor]} auf Minimum gekürzt (${min[donor]} Wochen).`)
      }
    }
  }
  return { counts, warnings }
}

// Peak km (peak-and-recovery.md 1.3): the smallest of what you are used to, what the time allows and twice the current km.
function peakFor(input: SkeletonInput, Wg: number) {
  const v = input.template.volume
  const B = input.currentKm
  const P = Math.max(input.provenKm ?? B, B)
  const novice = input.experience === 'novice' || B < NOVICE.km
  const g = novice ? Math.min(v.peak.over_base, NOVICE.overBase) : v.peak.over_base
  const n = novice ? Math.min(v.growth, NOVICE.growth) : v.growth
  const nR = novice ? Math.min(v.growth_return, NOVICE.growth) : v.growth_return
  const gR = SAFETY.peakOverBaseMax
  const hist = Math.max(B * g, Math.min(P * v.peak.over_proven, B * gR))
  const caps: [Binding, number][] = [
    [B * g < Math.min(P * v.peak.over_proven, B * gR) && P * v.peak.over_proven > B * gR ? 'absolute' : 'history', hist],
    ['time', climb(B, P, Wg, n, nR)],
  ]
  if (v.peak.max_km != null) caps.push(['template', v.peak.max_km])
  let [binding, k] = caps.reduce((a, b) => (b[1] < a[1] - 1e-9 ? b : a))
  if (k < B) { binding = 'current'; k = B }
  let K = roundKm(k)
  if (K < B) K = Math.ceil(B / STEP) * STEP
  return { K, binding, B, P, g, n, nR, novice }
}

function explain(input: SkeletonInput, p: ReturnType<typeof peakFor>, Wg: number, K: number, chosen: number): string[] {
  const source = input.currentKmSource === 'recoveryBlock' ? 'letzte Woche deines Erholungsblocks'
    : input.currentKmSource === 'plan' ? 'geplante Woche vor dem Start'
    : input.currentKmSource === 'manual' ? 'von dir gesetzt'
    : input.currentKmSource === 'runs2' ? 'Schnitt deiner letzten 2 Wochen'
    : input.currentKmSource === 'return' ? 'Wiedereinstieg nach der Pause' : 'Schnitt der letzten 4 Wochen'
  const v = input.template.volume
  const why = [chosen === K ? `Spitze ${num(K)} km pro Woche.` : `Empfohlene Spitze ${num(K)} km pro Woche (geplant: ${num(chosen)} km, von dir gesetzt).`, `Ausgangspunkt: Du läufst zurzeit ${num(p.B)} km pro Woche (${source}).`]
  if (p.binding === 'history') {
    why.push(`Neu dazukommen dürfen höchstens ${pct(p.g - 1)} (${num(p.B * p.g)} km).`
      + (p.P > p.B ? ` In den letzten 12 Monaten hast du schon ${num(p.P)} km über vier Wochen gehalten – bis dahin darfst du zurück.` : '')
      + ' Mehr als das plant Runmate nicht, solange du es nicht einmal gehalten hast.')
  }
  if (p.binding === 'time') {
    why.push(`Bis zur Spitzenphase bleiben ${Wg} Wochen. Mit höchstens ${pct(p.nR)} pro Woche, solange du unter deinem bisherigen`
      + ` Umfang bleibst, und ${pct(p.n)} darüber, sind in dieser Zeit ${num(p.K)} km erreichbar.`)
  }
  if (p.binding === 'absolute') why.push('Mehr als das Doppelte deines aktuellen Umfangs plant Runmate nie.')
  if (p.binding === 'template') why.push(`Die Vorlage begrenzt die Spitze auf ${num(v.peak.max_km ?? K)} km.`)
  if (p.binding === 'current') why.push('Die Spitze liegt nie unter dem, was du jetzt schon läufst.')
  if (p.novice) why.push(`Als Einsteiger plant Runmate vorsichtiger: höchstens ${pct(p.g - 1)} neu und ${pct(p.n)} pro Woche.`)
  why.push('Warum so? Verletzungen hängen weniger an einer festen 10-%-Regel als daran, wie weit du über das hinausgehst, was dein'
    + ' Körper gewohnt ist. Deshalb richtet sich die Spitze nach deinem jetzigen und deinem schon gehaltenen Umfang, nicht nur nach dem Rennen.')
  return why
}

// Which non-taper weeks are load, recovery or tune-up weeks (peak-and-recovery.md 2.2, load-cycles.md rules 1–3).
function placeWeeks(N: number, e: number, tune: Set<number>, warnings: string[]): WeekKind[] {
  const kind: WeekKind[] = []
  let c = 0
  for (let i = 0; i < N; i++) {
    if (tune.has(i)) { kind.push('tuneup'); c = 0 }
    else if (c === e - 1 && !tune.has(i + 1)) { kind.push('recovery'); c = 0 }
    else { kind.push('load'); c++ }
  }
  // Never a down week right before the taper: move it earlier while ≥ 2 load weeks stay after the previous one, else drop it.
  const m = SAFETY.preTaperLoadWeeksMin
  for (let i = Math.max(0, N - m); i < N; i++) {
    if (kind[i] !== 'recovery') continue
    kind[i] = 'load'
    const target = N - m - 1
    const prev = kind.slice(0, Math.max(0, target)).map((k, j) => (k === 'load' ? -1 : j)).reduce((a, b) => Math.max(a, b), -1)
    if (target >= 0 && kind[target] === 'load' && target - prev - 1 >= 2) kind[target] = 'recovery'
  }
  // At most SAFETY.maxLoadWeeksInRow load weeks in a row: a recovery week in the middle of a longer run.
  for (;;) {
    let a = -1
    let found: [number, number] | null = null
    for (let i = 0; i <= N; i++) {
      if (i < N && kind[i] === 'load') { if (a < 0) a = i; continue }
      if (a >= 0 && i - a > SAFETY.maxLoadWeeksInRow) { found = [a, i - 1]; break }
      a = -1
    }
    if (!found) break
    const mid = found[0] + Math.ceil((found[1] - found[0]) / 2)
    kind[mid] = 'recovery'
    warnings.push(`Erholungswoche in Woche ${mid + 1} eingefügt: höchstens ${SAFETY.maxLoadWeeksInRow} Belastungswochen am Stück.`)
  }
  return kind
}

export function buildSkeleton(input: SkeletonInput): SkeletonResult {
  const t = input.template
  const T = t.phases.taper.weeks[input.distance]
  if (!t.distances.includes(input.distance) || !T) {
    return { ok: false, error: `Die Vorlage „${t.name}“ hat keinen Plan für ${DISTANCE[input.distance]}.` }
  }
  const first = monday(input.start)
  const W = Math.floor(differenceInCalendarDays(parseISO(monday(input.raceDate)), parseISO(first)) / 7) + 1
  const N = W - T
  if (N < 3) return { ok: false, error: `Mindestens ${T + 3} Wochen bis zum Rennen (jetzt ${Math.max(0, W)}).` }

  const warnings: string[] = []
  if (W < MIN_TOTAL[input.distance]) warnings.push(`Kurzer Aufbau für ${DISTANCE[input.distance]}: ${W} Wochen (üblich ab ${MIN_TOTAL[input.distance]}).`)
  const { counts, warnings: phaseWarnings } = allocate(N, t, input.distance)
  warnings.push(...phaseWarnings)
  const phaseOf = (i: number): Phase => (i >= N ? 'taper' : i >= counts.base + counts.build ? 'peak' : i >= counts.base ? 'build' : 'base')
  const Wg = counts.base + counts.build

  // Peak: recommended from the research rule; a hand-set peak is capped by what is reachable at SAFETY limits.
  const B = input.currentKm
  const rec = peakFor(input, Wg)
  let K = rec.K
  if (input.peakKm != null) {
    const reachable = Math.min(B * SAFETY.peakOverBaseMax, climb(B, rec.P, Wg, SAFETY.netGrowthMax, SAFETY.netGrowthMax))
    K = roundKm(Math.min(input.peakKm, reachable))
    if (K < input.peakKm) warnings.push(`Spitze ${num(input.peakKm)} km auf ${num(K)} km begrenzt (höchstens das Doppelte und ${pct(SAFETY.netGrowthMax)} pro Woche).`)
    if (K > rec.K) warnings.push(`Spitze ${num(K)} km liegt über der Empfehlung ${num(rec.K)} km`)
    if (K < B) {
      warnings.push(`Spitze ${num(input.peakKm)} km liegt unter deinem aktuellen Umfang – geplant wird mit ${num(Math.ceil(B / STEP) * STEP)} km.`)
      K = Math.ceil(B / STEP) * STEP
    }
  }
  if (K < t.volume.peak.floor[input.distance]) warnings.push(`Für ${DISTANCE[input.distance]} ist das wenig – Ziel oder Termin prüfen (Spitze ${num(K)} km).`)

  // Recovery, tune-up and load weeks before the taper.
  const starts = Array.from({ length: W }, (_, i) => ymd(addDays(parseISO(first), 7 * i)))
  const tune = new Set((input.tuneUps ?? []).map((d) => starts.indexOf(monday(d))).filter((i) => i >= 0 && i < N))
  const every = input.age != null && input.age >= MASTERS.age ? Math.min(t.volume.recovery_week.every, MASTERS.every) : t.volume.recovery_week.every
  const kind = placeWeeks(N, input.experience === 'novice' ? Math.min(every, MASTERS.every) : every, tune, warnings)

  // Shares: the template's highest share is the peak week; the curve starts at s0 and keeps the template's shape.
  const v = t.volume
  const top = Math.max(...BUILD_PHASES.flatMap((p) => v.phases[p]))
  const sn0 = v.start / top
  const s0 = clamp(B / K, v.start, MAX_START_SHARE)
  // Clamped to [s0, 1]: a share below the start share (possible in an own method, 07-19) must not extrapolate below zero.
  const remap = (s: number) => (1 - sn0 < 1e-9 ? 1 : clamp(s0 + (s / top - sn0) * (1 - s0) / (1 - sn0), s0, 1))
  const target: number[] = []
  for (const p of BUILD_PHASES) {
    const idx = Array.from({ length: N }, (_, i) => i).filter((i) => phaseOf(i) === p && kind[i] === 'load')
    const [a, b] = v.phases[p]
    idx.forEach((i, j) => { target[i] = remap(idx.length > 1 ? a + (b - a) * j / (idx.length - 1) : a) })
  }

  // Km: load weeks follow the target, capped by the ramp against the last load week (B before the plan); after
  // SAFETY.maxRampWeeksInRow rising weeks the next one holds; recovery and tune-up weeks = last load week × recovery share.
  const ramp = Math.min(v.ramp_max, SAFETY.rampMax)
  const weeks: SkeletonWeek[] = []
  let lastLoad = B
  let prev = B
  let risingRun = 0
  for (let i = 0; i < N; i++) {
    let km: number
    let rising = false
    let hold = false
    if (kind[i] === 'load') {
      km = Math.min(roundKm(target[i] * K), floorKm(lastLoad * (1 + ramp)))
      rising = km >= prev * RISING - 1e-9
      if (rising && risingRun >= SAFETY.maxRampWeeksInRow) { km = prev; rising = false; hold = true }
      risingRun = rising ? risingRun + 1 : 0
      lastLoad = km
    } else {
      km = floorKm(lastLoad * v.recovery_week.volume)
      risingRun = 0
    }
    weeks.push({ start: starts[i], kw: getISOWeek(parseISO(starts[i])), phase: phaseOf(i), kind: kind[i], km, share: 0, rising, hold })
    prev = km
  }
  // Taper: share × peak, never above the week before (phases-and-taper.md 2.3 rules 1, 7).
  const vol = t.phases.taper.volume
  for (let j = 0; j < T; j++) {
    const i = N + j
    const km = Math.min(floorKm(vol[Math.max(0, vol.length - T + j)] * K), prev)
    weeks.push({ start: starts[i], kw: getISOWeek(parseISO(starts[i])), phase: 'taper', kind: 'taper', km, share: 0, rising: false, hold: false })
    prev = km
  }
  for (const w of weeks) w.share = Math.round((w.km / K) * 100) / 100

  // Runs of load weeks, for the draft review ("3 Belastungswochen, dann Erholung").
  const runs: LoadRun[] = []
  for (let i = 0; i < N; i++) {
    if (weeks[i].kind !== 'load') continue
    if (i > 0 && weeks[i - 1].kind === 'load') {
      const r = runs[runs.length - 1]
      r.weeks++
      r.rising = r.rising && weeks[i].rising
    } else runs.push({ from: weeks[i].start, weeks: 1, rising: weeks[i].rising })
  }

  const phases = { ...counts, taper: T }
  return { ok: true, weeks, peakKm: K, peak: { recommendedKm: rec.K, binding: rec.binding, why: explain(input, rec, Wg, rec.K, K) }, phases, runs, warnings }
}

// One placeholder session per week (Monday), so describePlan() / compareToTemplate() can measure a skeleton.
export function skeletonToSessions(sk: Skeleton): PlanLike[] {
  return sk.weeks.map((w) => ({ date: w.start, type: w.km > 0 ? 'easy' : 'rest', km: w.km, title: `${PHASE_LABEL[w.phase]} ${w.km} km` }))
}
