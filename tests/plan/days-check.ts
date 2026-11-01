// Rules every generated day plan must keep (07-03). German-labelled violations, like checkSkeleton().
// Sources: methodologies/research/week-layout.md (1.2, 2.2), long-run.md (1.2, 2.2), phases-and-taper.md 2.3 rules 2, 4, 5.
import { addDays, differenceInCalendarDays, format, getISODay, parseISO } from 'date-fns'
import { SAFETY } from '@/lib/plan/methodology/safety'
import { DAY_RULES, availableRunDays, type DaysInput, type DaysPlan } from '@/lib/plan/generator/days'
import type { Skeleton } from '@/lib/plan/generator/skeleton'
import type { PlanSession } from '@/lib/plan/types'

const ROUND = 0.25
const floorKm = (n: number) => Math.floor(n / 0.5 + 1e-9) * 0.5
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const runKm = (s?: PlanSession) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)

export function checkDays(plan: DaysPlan, sk: Skeleton, input: DaysInput): string[] {
  const out: string[] = []
  const t = input.template
  const R = DAY_RULES
  const days = plan.sessions
  const byDate = new Map(days.map((s) => [s.date, s]))
  const first = sk.weeks[0].start
  const last = ymd(addDays(parseISO(sk.weeks[sk.weeks.length - 1].start), 6))
  const avail = new Set<number>(availableRunDays(input.profile))
  const profile = input.profile ?? R.defaultProfile
  const cap = (d: string) => (getISODay(parseISO(d)) >= 6 ? profile.maxKmWeekend : profile.maxKmWeekday) ?? Infinity
  const g = t.week.key_gap_days
  const longPace = input.racePaceS + (t.paces.offsets.long ?? t.paces.offsets.easy ?? 60)

  // One session per date, first Monday … race week's Sunday.
  const want = differenceInCalendarDays(parseISO(last), parseISO(first)) + 1
  if (days.length !== want || new Set(days.map((s) => s.date)).size !== days.length) out.push(`${days.length} Tage statt ${want} (Lücke oder doppelter Tag)`)
  days.forEach((s, i) => { if (s.date !== ymd(addDays(parseISO(first), i))) out.push(`Tag ${i + 1}: ${s.date} statt ${ymd(addDays(parseISO(first), i))}`) })

  const race = days.find((s) => s.type === 'race')
  if (!race || race.date !== input.raceDate) out.push('Kein Renntag am Renndatum')
  else if (race.km !== R.raceKm[input.distance] || !race.anchor) out.push(`Renntag: ${race.km} km, anchor ${race.anchor}`)

  // Per day: available days, rest day, profile cap, minimum run.
  for (const s of days) {
    if (s.type === 'race') continue
    const wd = getISODay(parseISO(s.date))
    const km = runKm(s)
    if (km > 0 && !avail.has(wd)) out.push(`${s.date}: Lauf an einem nicht verfügbaren Tag`)
    if (km > cap(s.date) + 1e-9) out.push(`${s.date}: ${km} km über dem Tageslimit ${cap(s.date)} km`)
    if (km > 0 && km < R.minRunKm && s.title !== 'Shakeout') out.push(`${s.date}: ${km} km unter ${R.minRunKm} km`)
  }

  // Weeks: km = skeleton km (lower only with a warning); long run day; hard days and spacing.
  let lastLoadLong: number | null = null
  let lastPeakLong: number | null = null
  let taperIdx = 0
  const raceIdx = sk.weeks.length - 1
  const lim = raceIdx - R.longestWeeksBefore[input.distance]
  let maxBefore = 0
  let bigLongs = 0
  for (let i = 0; i < sk.weeks.length; i++) {
    const w = sk.weeks[i]
    const week = Array.from({ length: 7 }, (_, k) => byDate.get(ymd(addDays(parseISO(w.start), k))))
    const km = week.reduce((a, s) => a + runKm(s), 0)
    const kw = `KW ${w.kw}`
    if (km > w.km + 1e-9) out.push(`${kw}: ${km} km über dem Gerüst (${w.km} km)`)
    if (km < w.km - 1e-9 && !plan.warnings.some((x) => x.includes(kw))) out.push(`${kw}: ${km} statt ${w.km} km ohne Hinweis`)
    const long = week.find((s) => s?.type === 'long')
    if (i === raceIdx) { if (long) out.push(`${kw}: Longrun in der Rennwoche`); continue }
    if (profile.longRunDay && avail.has(profile.longRunDay) && long && getISODay(parseISO(long.date)) !== profile.longRunDay) {
      out.push(`${kw}: Longrun nicht am Longrun-Tag`)
    }

    // Long run caps, spike rule, progression limits.
    if (long) {
      const L = long.km ?? 0
      const factor = R.phaseFactor[w.phase]
      let c = Math.min(t.week.long_run.share * w.km, t.week.long_run.max_km * factor, (t.week.long_run.max_minutes * 60) / longPace,
        cap(long.date), SAFETY.longRunKmMax)
      if (input.distance === 'marathon') {
        if ((input.longest12mKm ?? 0) < R.marathon.bigKm) c = Math.min(c, R.marathon.bigKm - 0.5)
        if (bigLongs >= R.marathon.maxLong) c = Math.min(c, R.marathon.longKm - 0.5)
      }
      if (L > Math.max(c, R.minRunKm) + ROUND) out.push(`${kw}: Longrun ${L} km über der Grenze ${Math.round(c * 10) / 10} km`)
      const from = ymd(addDays(parseISO(long.date), -R.spikeDays))
      let longest = from < first ? input.longest30Km : 0
      for (const s of days) if (s.date >= from && s.date < long.date) longest = Math.max(longest, runKm(s))
      if (L > Math.max(R.minRunKm, floorKm((1 + SAFETY.longRunSpikeMax) * longest)) + 1e-9) out.push(`${kw}: Longrun ${L} km mehr als +${SAFETY.longRunSpikeMax * 100} % auf ${longest} km (30 Tage)`)
      if (w.phase === 'taper' && lastPeakLong != null) {
        const f = R.taperLong[Math.min(taperIdx, R.taperLong.length - 1)]
        if (L > Math.max(R.minRunKm, floorKm(f * lastPeakLong)) + 1e-9) out.push(`${kw}: Taper-Longrun ${L} km über ${f} × ${lastPeakLong} km`)
      }
      if (w.phase !== 'taper') {
        if (i <= lim) maxBefore = Math.max(maxBefore, L)
        else if (L > Math.max(R.minRunKm, floorKm(R.laterLongMax * maxBefore)) + 1e-9) out.push(`${kw}: Longrun ${L} km nach dem längsten Lauf über ${R.laterLongMax} × ${maxBefore} km`)
        if (w.kind === 'load') { if (lastLoadLong != null && L > lastLoadLong + R.stepKm + 1e-9) out.push(`${kw}: Longrun +${L - lastLoadLong} km`); lastLoadLong = L; lastPeakLong = L }
      }
      if (L >= R.marathon.longKm) bigLongs++
    }
    if (w.phase === 'taper') taperIdx++

    // Hard days: key slots + hard long run; spacing and count.
    const q = w.phase === 'taper' ? t.week.key_sessions.taper : t.week.key_sessions[w.phase]
    const isHard = (s?: PlanSession) => !!s && (s.key || (s.type === 'long' && (s.km ?? 0) >= SAFETY.longRunMinKmForHard))
    const hard = week.filter(isHard).length
    if (hard > q + 1) out.push(`${kw}: ${hard} harte Tage (Vorlage ${q} Schlüsseleinheiten + Longrun)`)
  }

  // Key spacing across the whole plan (also over week boundaries).
  const hardDays = days.filter((s) => s.type !== 'race' && (s.key || (s.type === 'long' && (s.km ?? 0) >= SAFETY.longRunMinKmForHard)))
  const longDays = new Set(days.filter((s) => s.type === 'long').map((s) => s.date))
  for (const k of days.filter((s) => s.key && s.type !== 'long' && s.type !== 'race')) {
    for (const h of hardDays) {
      if (h === k) continue
      const gap = Math.abs(differenceInCalendarDays(parseISO(k.date), parseISO(h.date)))
      if (gap < g) out.push(`${k.date}: Schlüsseleinheit ${gap} Tag(e) neben ${h.date} (mindestens ${g})`)
    }
    if (longDays.has(ymd(addDays(parseISO(k.date), -1)))) out.push(`${k.date}: Schlüsseleinheit am Tag nach dem Longrun`)
  }
  // Never three hard days in a row (with key_gap_days 1 two may touch).
  const hardSet = new Set(hardDays.map((s) => s.date))
  for (const s of hardDays) {
    if (hardSet.has(ymd(addDays(parseISO(s.date), 1))) && hardSet.has(ymd(addDays(parseISO(s.date), 2)))) out.push(`${s.date}: drei harte Tage hintereinander`)
  }
  return out
}
