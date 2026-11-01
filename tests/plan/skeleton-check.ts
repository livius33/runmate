// Rules every generated week skeleton must keep (07-02). German-labelled violations, so 07-03 can run the same checks
// on full plans. Sources: methodologies/research/peak-and-recovery.md (peak 1.3, recovery 2.2), load-cycles.md
// (rules 2–4), phases-and-taper.md (phases 1.3, taper 2.3 rules 1, 6, 7); limits from SAFETY.
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { SAFETY } from '@/lib/plan/methodology/safety'
import type { Skeleton, SkeletonInput } from '@/lib/plan/generator/skeleton'

const ROUND = 0.25                 // 0,5-km steps: a rounded value may sit up to 0,25 km past an exact limit
const RISING = 1.03                // load-cycles.md: a rising week is ≥ +3 % on the week before
const ORDER = ['base', 'build', 'peak', 'taper'] as const
const monday = (d: string) => format(startOfWeek(parseISO(d), { weekStartsOn: 1 }), 'yyyy-MM-dd')
const floorKm = (n: number) => Math.floor(n / 0.5 + 1e-9) * 0.5

export function checkSkeleton(sk: Skeleton, input: SkeletonInput): string[] {
  const out: string[] = []
  const t = input.template
  const w = sk.weeks
  const B = input.currentKm
  const K = sk.peakKm
  const ramp = Math.min(t.volume.ramp_max, SAFETY.rampMax)
  const T = t.phases.taper.weeks[input.distance] ?? 0
  const N = w.length - T

  // Weeks: consecutive Mondays from the start's week to the race week.
  if (w[0]?.start !== monday(input.start)) out.push(`Woche 1 beginnt ${w[0]?.start}, nicht am Montag der Startwoche`)
  for (let i = 1; i < w.length; i++) {
    const want = format(addDays(parseISO(w[i - 1].start), 7), 'yyyy-MM-dd')
    if (w[i].start !== want) out.push(`Woche ${i + 1}: ${w[i].start} statt ${want} (Lücke oder doppelte Woche)`)
  }
  if (w[w.length - 1]?.start !== monday(input.raceDate)) out.push('Die letzte Woche enthält das Rennen nicht')

  // Phases in order, counts as reported, taper as the template says.
  for (let i = 1; i < w.length; i++) {
    if (ORDER.indexOf(w[i].phase) < ORDER.indexOf(w[i - 1].phase)) out.push(`Woche ${i + 1}: Phase ${w[i].phase} nach ${w[i - 1].phase}`)
  }
  for (const p of ORDER) {
    const n = w.filter((x) => x.phase === p).length
    if (n !== sk.phases[p]) out.push(`Phase ${p}: ${n} Wochen, gemeldet ${sk.phases[p]}`)
  }
  if (sk.phases.taper !== T) out.push(`Taper ${sk.phases.taper} Wochen, Vorlage ${T}`)

  // Peak: never below current km and at most SAFETY.peakOverBaseMax × current (unless set by hand).
  if (input.peakKm == null) {
    if (K < B - ROUND) out.push(`Spitze ${K} km unter dem aktuellen Umfang ${B} km`)
    if (K > B * SAFETY.peakOverBaseMax + ROUND) out.push(`Spitze ${K} km über ${SAFETY.peakOverBaseMax} × aktuellem Umfang`)
  }
  w.forEach((x, i) => { if (x.km > K + 1e-9) out.push(`Woche ${i + 1}: ${x.km} km über der Spitze ${K} km`) })

  // Load weeks: ramp against the last load week (B before the plan); recovery weeks lighter than the last load week.
  let lastLoad = B
  let prev = B
  let loadRun = 0
  let risingRun = 0
  for (let i = 0; i < N; i++) {
    const x = w[i]
    if (x.kind === 'load') {
      if (x.km > lastLoad * (1 + ramp) + 1e-9) out.push(`Woche ${i + 1}: ${x.km} km, mehr als +${Math.round(ramp * 100)} % auf ${lastLoad} km`)
      loadRun++
      risingRun = x.km >= prev * RISING - 1e-9 ? risingRun + 1 : 0
      if (loadRun > SAFETY.maxLoadWeeksInRow) out.push(`Woche ${i + 1}: mehr als ${SAFETY.maxLoadWeeksInRow} Belastungswochen am Stück`)
      if (risingRun > SAFETY.maxRampWeeksInRow) out.push(`Woche ${i + 1}: mehr als ${SAFETY.maxRampWeeksInRow} steigende Wochen am Stück`)
      lastLoad = x.km
    } else if (x.kind === 'recovery' || x.kind === 'tuneup') {
      if (x.km > lastLoad * SAFETY.recoveryVolumeMax + 1e-9 || (lastLoad > 0 && x.km >= lastLoad)) {
        out.push(`Woche ${i + 1}: Erholungswoche ${x.km} km nicht leichter als ${lastLoad} km`)
      }
      loadRun = 0
      risingRun = 0
    } else out.push(`Woche ${i + 1}: ${x.kind} vor dem Taper`)
    prev = x.km
  }
  // The last weeks before the taper are load weeks (a tune-up race may sit there; it is a race, not a planned down week).
  for (let i = Math.max(0, N - SAFETY.preTaperLoadWeeksMin); i < N; i++) {
    if (w[i].kind === 'recovery') out.push(`Woche ${i + 1}: Erholungswoche direkt vor dem Taper`)
  }

  // Taper: share × peak, never above the week before; race week ≤ SAFETY.taperRaceWeekMax × peak.
  const vol = t.phases.taper.volume
  const shares = Array.from({ length: T }, (_, j) => vol[Math.max(0, vol.length - T + j)])
  for (let j = 0; j < T; j++) {
    const i = N + j
    const x = w[i]
    if (x.kind !== 'taper') out.push(`Woche ${i + 1}: ${x.kind} im Taper`)
    const want = Math.min(floorKm(shares[j] * K), w[i - 1]?.km ?? Infinity)
    if (Math.abs(x.km - want) > 1e-9) out.push(`Taper-Woche ${j + 1}: ${x.km} km statt ${want} km`)
  }
  const race = w[w.length - 1]
  if (T > 0 && race.km > SAFETY.taperRaceWeekMax * K + ROUND) out.push(`Rennwoche ${race.km} km über ${SAFETY.taperRaceWeekMax * 100} % der Spitze`)
  return out
}
