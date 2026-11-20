// Generator step 2 (07-03): the day plan — one session per calendar day from the skeleton's first Monday to the race
// week's Sunday: rest days, easy and recovery runs, key-session slots (the workouts come in 07-13), the long run and the
// race week built backwards from the race. Rules: methodologies/research/week-layout.md (1.2 runs per week, 2.2 spacing),
// long-run.md (1.2 caps, 2.2 progression + spike rule) and phases-and-taper.md 2.3 (rules 2, 4, 5). Pure.
import { addDays, differenceInCalendarDays, format, getISODay, getISOWeek, parseISO } from 'date-fns'
import type { Distance, Methodology } from '../methodology/schema'
import type { Phase } from '../methodology/describe'
import { SAFETY } from '../methodology/safety'
import type { AthleteProfile, Weekday } from '../athlete-profile'
import type { PlanSession, PlanWeek } from '../types'
import type { Skeleton } from './skeleton'

export interface DaysInput {
  template: Methodology
  distance: Distance
  raceDate: string
  raceName?: string
  racePaceS: number                // goal race pace, s/km (long-run pace = race pace + paces.offsets.long)
  profile: AthleteProfile | null   // null → default run days, with a warning
  longest30Km: number              // longest run of the 30 days before the plan start (Garmin)
  longest12mKm?: number | null     // longest run of the last 12 months (marathon ≥ 35-km rule)
}
export interface DaysPlan { ok: true; sessions: PlanSession[]; weeks: PlanWeek[]; warnings: string[] }
export type DaysResult = DaysPlan | { ok: false; error: string }

// Code constants named by the research notes (week-layout.md 1.2/2.2, long-run.md 1.2/2.2, phases-and-taper.md 2.3).
export const DAY_RULES = {
  minRunKm: 5,
  noviceRuns: 4,
  weight: { key: 1.25, easy: 1, recovery: 0.7 },          // share of the non-long km per run (practice value)
  phaseFactor: { base: 0.75, build: 0.9, peak: 1, taper: 1 } as Record<Phase, number>,
  lowVolume: { fullKm: 64, lowKm: 32 },                    // long-run share: the template's from 64 km/week, rising to SAFETY's below (long-run.md 1.3)
  stepKm: 2,                                               // long run + 2 km per load week …
  holdRiseKm: 1.5,                                         // … holding after two rises of ≥ 1,5 km
  recoveryLong: 0.7,
  taperLong: [0.75, 0.55],
  longestWeeksBefore: { marathon: 3, half: 2, '10k': 2 } as Record<Distance, number>,
  laterLongMax: 0.85,
  marathon: { longKm: 32, maxLong: 3, bigKm: 35 },
  minLongest: { marathon: 30, half: 21.1, '10k': 10 } as Record<Distance, number>,
  raceKm: { marathon: 42.2, half: 21.1, '10k': 10 } as Record<Distance, number>,
  raceWeek: { shakeoutKm: 3, keyKm: { marathon: 11, half: 9, '10k': 7 } as Record<Distance, number>, easyMin: 5, easyMax: 8 },
  spikeDays: 30,
  defaultProfile: { availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, restDay: 5, qualityDays: [2, 4], maxKmWeekday: null, maxKmWeekend: null } as
    Pick<AthleteProfile, 'availableDays' | 'longRunDay' | 'restDay' | 'qualityDays' | 'maxKmWeekday' | 'maxKmWeekend'>,
} as const

// Long-run share of a week: the template's share is a rule for high volume. Below 64 km it rises linearly to the safety
// ceiling at 32 km, so a low-volume week still has a long run (long-run.md 1.3). Never below the template's own share.
export function longShare(templateShare: number, weekKm: number): number {
  const { fullKm, lowKm } = DAY_RULES.lowVolume
  const t = Math.min(Math.max((fullKm - weekKm) / (fullKm - lowKm), 0), 1)
  return Math.max(templateShare, templateShare + t * (SAFETY.longRunShareMax - templateShare))
}

type Role = 'rest' | 'easy' | 'recovery' | 'key' | 'long' | 'race' | 'shakeout'
const TITLE: Record<Role, string> = { rest: 'Ruhetag', easy: 'Locker', recovery: 'Regeneration', key: 'Qualität', long: 'Longrun', race: 'Rennen', shakeout: 'Shakeout' }
const PHASE_LABEL: Record<Phase, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' }

const STEP = 0.5
const roundKm = (n: number) => Math.round(n / STEP) * STEP
const floorKm = (n: number) => Math.floor(n / STEP + 1e-9) * STEP
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const plus = (d: string, n: number) => ymd(addDays(parseISO(d), n))
const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

// Weekdays the athlete can run: the profile's available days without the rest day.
export function availableRunDays(profile: AthleteProfile | null): Weekday[] {
  const p = profile ?? DAY_RULES.defaultProfile
  return (p.availableDays as Weekday[]).filter((d) => d !== p.restDay).sort((a, b) => a - b)
}

export function buildDays(sk: Skeleton, input: DaysInput): DaysResult {
  const t = input.template
  const R = DAY_RULES
  const warnings: string[] = []
  if (!input.profile) warnings.push('Kein Trainingsprofil: Standard-Lauftage (Fr Ruhe, Sa Longrun, Di/Do Qualität).')
  const profile = input.profile ?? R.defaultProfile
  const A = availableRunDays(input.profile)
  if (A.length < 2) return { ok: false, error: 'Zu wenige Lauftage: mindestens 2 pro Woche (Longrun und ein lockerer Lauf).' }
  const novice = input.profile?.experience === 'novice'
  const longDay: Weekday = profile.longRunDay && A.includes(profile.longRunDay as Weekday) ? profile.longRunDay as Weekday
    : A.includes(6) ? 6 : A.includes(7) ? 7 : A[A.length - 1]
  if (longDay !== profile.longRunDay) warnings.push(`Longrun-Tag nicht verfügbar: Longrun am ${['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][longDay]}.`)
  // Days of the week before race week that lie within 6 days of the race (a race early in the week, 07-22) are race-week
  // days: easy and short, no long run, no key session.
  let nearRace = new Set<number>()
  const cap = (wd: number) => Math.min((wd >= 6 ? profile.maxKmWeekend : profile.maxKmWeekday) ?? Infinity, nearRace.has(wd) ? R.raceWeek.easyMax : Infinity)
  const g = t.week.key_gap_days
  const longPace = input.racePaceS + (t.paces.offsets.long ?? t.paces.offsets.easy ?? 60)
  const first = sk.weeks[0].start
  const raceIdx = sk.weeks.length - 1
  const lim = raceIdx - R.longestWeeksBefore[input.distance]

  // 1 · Long runs, week by week (caps, spike rule against the last 30 days, progression, recovery, taper).
  const longs: (number | null)[] = []
  const longDates: string[] = []
  const longest30s: number[] = sk.weeks.map(() => 0)   // per week: longest long run of the 30 days before its long-run day
  let lastLoad: number | null = null
  let lastPeak: number | null = null
  const rises: number[] = []
  let maxBefore = 0
  let bigLongs = 0
  let taperIdx = 0
  for (let i = 0; i < sk.weeks.length; i++) {
    const w = sk.weeks[i]
    const date = plus(w.start, longDay - 1)
    longDates.push(date)
    const from = plus(date, -R.spikeDays)
    let longest30 = from < first ? input.longest30Km : 0
    longs.forEach((k, j) => { if (k != null && longDates[j] >= from && longDates[j] < date) longest30 = Math.max(longest30, k) })
    longest30s[i] = longest30
    if (i === raceIdx) { longs.push(null); continue }
    let c = Math.min(longShare(t.week.long_run.share, w.km) * w.km, t.week.long_run.max_km * R.phaseFactor[w.phase],
      (t.week.long_run.max_minutes * 60) / longPace, cap(longDay), SAFETY.longRunKmMax)
    if (input.distance === 'marathon') {
      if ((input.longest12mKm ?? 0) < R.marathon.bigKm) c = Math.min(c, R.marathon.bigKm - STEP)
      if (bigLongs >= R.marathon.maxLong) c = Math.min(c, R.marathon.longKm - STEP)
    }
    c = Math.min(c, (1 + SAFETY.longRunSpikeMax) * longest30)
    if (w.phase !== 'taper' && i > lim) c = Math.min(c, R.laterLongMax * maxBefore)
    let L: number
    if (w.phase === 'taper') {
      L = Math.min(c, R.taperLong[Math.min(taperIdx++, R.taperLong.length - 1)] * (lastPeak ?? c))
    } else if (w.kind !== 'load') {
      L = Math.min(c, R.recoveryLong * (lastLoad ?? input.longest30Km))
    } else {
      const hold = rises.length >= 2 && rises.slice(-2).every((r) => r >= R.holdRiseKm)
      L = lastLoad == null ? Math.min(c, input.longest30Km) : Math.min(c, lastLoad + (hold ? 0 : R.stepKm))
      L = floorKm(L)
      if (lastLoad != null) rises.push(hold ? 0 : L - lastLoad)
    }
    L = Math.min(Math.max(floorKm(L), R.minRunKm), w.km)
    if (w.phase !== 'taper' && w.kind === 'load') { lastLoad = L; lastPeak = L }
    if (w.phase !== 'taper' && i <= lim) maxBefore = Math.max(maxBefore, L)
    if (L >= R.marathon.longKm) bigLongs++
    longs.push(L)
  }
  const longest = Math.max(...longs.map((k) => k ?? 0))
  if (longest < R.minLongest[input.distance]) warnings.push(`Längster Lauf ${num(longest)} km – für ${input.distance === 'marathon' ? 'einen Marathon' : input.distance === 'half' ? 'einen Halbmarathon' : '10 km'} knapp.`)

  // 2 · Days per week.
  const sessions: PlanSession[] = []
  const weeks: PlanWeek[] = []
  const dropped: number[] = []
  let prevHard: string[] = []
  let prevLong: string | null = null
  let capped = false
  // No run longer than the long run (week-layout.md 1.3): weeks this bound alone keeps below their target.
  let byLong = false
  const cutByLong: { kw: number; km: number; target: number }[] = []
  for (let i = 0; i < sk.weeks.length; i++) {
    capped = false
    byLong = false
    const w = sk.weeks[i]
    const date = (wd: number) => plus(w.start, wd - 1)
    const role: Role[] = Array(8).fill('rest')
    const km: number[] = Array(8).fill(0)
    let keyLong = false
    if (i === raceIdx) {
      raceWeek(w.km, role, km, floorKm(Math.max(longest30s[i], R.minRunKm)))
    } else {
      nearRace = new Set([1, 2, 3, 4, 5, 6, 7].filter((d) => date(d) < input.raceDate && date(d) > plus(input.raceDate, -7)))
      const longNear = nearRace.has(longDay)
      const L = longNear ? 0 : longs[i]!
      const longHard = L >= SAFETY.longRunMinKmForHard
      let runs = Math.min(t.week.runs, A.length)
      if (novice) runs = Math.min(runs, R.noviceRuns)
      if (w.phase === 'taper') runs = Math.max(runs, Math.min(3, A.length))
      let q = w.phase === 'taper' ? t.week.key_sessions.taper : t.week.key_sessions[w.phase]
      if (w.kind !== 'load' && w.phase !== 'taper') q = Math.min(q, 1)
      q = Math.max(0, Math.min(q, runs - 2))
      const order = [longDay, ...profile.qualityDays as Weekday[], (longDay + 1) as Weekday, ...A]
      const runDays = [...new Set(order.filter((d) => d <= 7 && A.includes(d as Weekday)))].slice(0, runs)
      for (const d of runDays) role[d] = 'easy'
      role[longDay] = longNear ? (A.includes(longDay as Weekday) ? 'easy' : 'rest') : 'long'
      // A hard long run takes the last key slot when the template asks for 2 or more (long run with pace, 07-13).
      if (longHard && q >= 2) { keyLong = true; q-- }
      const hard = longHard ? [date(longDay)] : []
      // Next week's long run counts too when it is hard (a long run on Monday after a Sunday key slot).
      const nextLong = i + 1 < raceIdx && (longs[i + 1] ?? 0) >= SAFETY.longRunMinKmForHard ? [plus(w.start, 7 + longDay - 1)] : []
      const gapOk = (d: number) => [...hard, ...prevHard, ...nextLong].every((h) => Math.abs(differenceInCalendarDays(parseISO(date(d)), parseISO(h))) >= g)
      // With key_gap_days 1 two hard days may touch (Pfitzinger), never three.
      const hardAt = (d: number) => hard.includes(date(d)) || prevHard.includes(date(d)) || nextLong.includes(date(d))
      const threeInRow = (d: number) => [[-2, -1], [-1, 1], [1, 2]].some(([a, b]) => hardAt(d + a) && hardAt(d + b))
      const placeable = (d: number) => role[d] === 'easy' && !nearRace.has(d) && gapOk(d) && d !== longDay + 1 && !(g >= 2 && d === longDay - 1)
        && !(prevLong && date(d) === plus(prevLong, 1)) && !threeInRow(d)
      let placed = 0
      for (const d of [...profile.qualityDays as Weekday[], ...runDays.slice().sort((a, b) => a - b)]) {
        if (placed >= q) break
        if (!placeable(d)) continue
        role[d] = 'key'
        hard.push(date(d))
        placed++
      }
      if (placed < q) dropped.push(w.kw)
      if (!longNear && longDay < 7 && role[longDay + 1] === 'easy') role[longDay + 1] = 'recovery'
      // As in race week: the day before the race a short shakeout, two days before rest.
      for (const d of nearRace) {
        if (date(d) === plus(input.raceDate, -1) && role[d] !== 'rest') { role[d] = 'shakeout'; km[d] = Math.min(R.raceWeek.shakeoutKm, floorKm(cap(d))) }
        else if (date(d) === plus(input.raceDate, -2)) role[d] = 'rest'
      }
      if (g === 1) for (let d = 1; d < 7; d++) if (role[d] === 'key' && role[d + 1] === 'easy') role[d + 1] = 'recovery'
      if (!longNear) km[longDay] = L
      fillWeek(w.km, L, role, km, floorKm(Math.max(L, longest30s[i], R.minRunKm)))
      prevHard = hard
      nearRace = new Set()
    }
    // Profile caps on the other days; whatever does not fit lowers the week.
    const total = km.reduce((a, b) => a + b, 0)
    if (byLong && !capped && total < w.km - 1e-9) cutByLong.push({ kw: w.kw, km: total, target: w.km })
    if (total < w.km - 1e-9 && (capped || !byLong)) warnings.push(i === raceIdx
      ? `KW ${w.kw}: Rennwoche ${num(total)} statt ${num(w.km)} km (lockere Tage höchstens ${R.raceWeek.easyMax} km).`
      : capped ? `KW ${w.kw}: Tageslimit begrenzt die Woche auf ${num(total)} statt ${num(w.km)} km.`
        : `KW ${w.kw}: ${num(total)} statt ${num(w.km)} km – zu wenig für Läufe ab ${R.minRunKm} km an allen Lauftagen.`)
    prevLong = role[longDay] === 'long' ? date(longDay) : null
    for (let d = 1; d <= 7; d++) {
      const r = role[d]
      const s: PlanSession = { date: date(d), type: r === 'key' ? 'tempo' : r === 'shakeout' ? 'easy' : r, title: TITLE[r] }
      if (r === 'race') Object.assign(s, { km: R.raceKm[input.distance], title: input.raceName ?? TITLE.race, anchor: true })
      else if (r !== 'rest') s.km = km[d]
      if (r === 'key' || (r === 'long' && keyLong)) s.key = true
      if (r === 'long' && keyLong) s.title = 'Longrun (Qualität)'
      sessions.push(s)
    }
    const focus = [PHASE_LABEL[w.phase], w.kind === 'recovery' ? 'Erholungswoche' : w.kind === 'tuneup' ? 'Testrennen' : i === raceIdx ? 'Rennwoche' : '']
    weeks.push({ kw: getISOWeek(parseISO(w.start)), start: w.start, end: date(7), km: total, focus: focus.filter(Boolean).join(' · '), ...(w.phase === 'taper' ? { taper: true } : {}), ...(w.kind === 'recovery' ? { cutback: true } : {}) })
  }
  if (cutByLong.length) {
    const n = cutByLong.length
    const worst = cutByLong.reduce((a, b) => (b.target - b.km > a.target - a.km ? b : a))
    const more = A.length < Math.min(t.week.runs, novice ? R.noviceRuns : 7)
    const limit = cap(longDay) < Infinity
    const way = more && limit ? ' Mehr Lauftage oder ein höheres Tageslimit am Longrun-Tag heben sie an.' : more ? ' Mehr Lauftage heben sie an.' : limit ? ' Ein höheres Tageslimit am Longrun-Tag hebt sie an.' : ''
    warnings.push(`Kein Lauf ist länger als der Longrun – ${n === 1 ? 'eine Woche bleibt' : `${n} Wochen bleiben`} deshalb unter dem Ziel (${n === 1 ? '' : 'am stärksten '}KW ${worst.kw}: ${num(worst.km)} statt ${num(worst.target)} km).${way}`)
  }
  if (dropped.length) warnings.push(`Nicht alle Schlüsseleinheiten passen in die Woche (Abstand ${g} Tage): KW ${dropped.join(', ')}.`)
  return { ok: true, sessions, weeks, warnings }

  // Race week backwards from the race (phases-and-taper.md 2.3 rule 5): race · −1 shakeout · −2 rest · −3 key ·
  // earlier days easy 5–8 km; days after the race rest. No run longer than the longest of the last 30 days (`longest`).
  function raceWeek(target: number, role: Role[], km: number[], longest: number) {
    const r = getISODay(parseISO(input.raceDate))
    role[r] = 'race'
    let used = 0
    if (r - 1 >= 1 && A.includes((r - 1) as Weekday) && target > 0) {
      role[r - 1] = 'shakeout'
      km[r - 1] = Math.min(R.raceWeek.shakeoutKm, floorKm(cap(r - 1)), target)
      used += km[r - 1]
    }
    // Race-pace reminder: same spacing rules as any key slot, also against last week's hard days and long run.
    const date = (d: number) => plus(sk.weeks[raceIdx].start, d - 1)
    let keyDay = 0
    for (const d of [r - 3, r - 4]) {
      const ok = d >= 1 && A.includes(d as Weekday) && !(prevLong && date(d) === plus(prevLong, 1))
        && prevHard.every((h) => Math.abs(differenceInCalendarDays(parseISO(date(d)), parseISO(h))) >= g)
        && !(prevHard.includes(date(d - 1)) && prevHard.includes(date(d - 2)))
      if (ok) { keyDay = d; break }
    }
    const keyKm = keyDay ? Math.min(R.raceWeek.keyKm[input.distance], floorKm(cap(keyDay)), longest, target - used) : 0
    if (keyDay && keyKm >= R.minRunKm) { role[keyDay] = 'key'; km[keyDay] = keyKm; used += keyKm } else keyDay = 0
    const easy = A.filter((d) => d < (keyDay || r - 2) && d < r - 2)
    const rest = target - used
    while (easy.length && rest / easy.length < R.raceWeek.easyMin) easy.pop()
    for (const d of easy) {
      const k = Math.min(R.raceWeek.easyMax, floorKm(cap(d)), longest, floorKm(rest / easy.length))
      if (k < R.minRunKm) continue
      role[d] = 'easy'
      km[d] = k
    }
  }

  // Non-long km over the other run days by weight; runs below the minimum drop (recovery first); caps; exact week sum.
  function fillWeek(target: number, L: number, role: Role[], km: number[], longest: number) {
    // The long run keeps its own limits (step 1); every other run also stays at or below `longest`.
    const top = (d: number) => (role[d] === 'long' ? cap(d) : Math.min(cap(d), longest))
    const others = () => [1, 2, 3, 4, 5, 6, 7].filter((d) => role[d] === 'key' || role[d] === 'easy' || role[d] === 'recovery')
    const left = target - L
    for (;;) {
      const ds = others()
      const sum = ds.reduce((a, d) => a + R.weight[role[d] as 'key' | 'easy' | 'recovery'], 0)
      for (const d of ds) km[d] = roundKm((left * R.weight[role[d] as 'key' | 'easy' | 'recovery']) / sum)
      const small = ds.filter((d) => km[d] < R.minRunKm)
      if (!small.length) break
      const drop = small.find((d) => role[d] === 'recovery') ?? small.find((d) => role[d] === 'easy') ?? small[small.length - 1]
      role[drop] = 'rest'
      km[drop] = 0
    }
    for (let d = 1; d <= 7; d++) if (role[d] === 'rest') km[d] = 0
    // Caps: clip, then hand what is missing to easy/recovery days with headroom (biggest easy day first).
    for (let d = 1; d <= 7; d++) if (km[d] > top(d)) { if (role[d] !== 'long' && longest <= cap(d)) byLong = true; else capped = true; km[d] = floorKm(top(d)) }
    let residual = target - km.reduce((a, b) => a + b, 0)
    const receivers = () => [1, 2, 3, 4, 5, 6, 7].filter((d) => role[d] === 'easy' || role[d] === 'recovery')
      .sort((a, b) => (role[a] === role[b] ? km[b] - km[a] : role[a] === 'easy' ? -1 : 1))
    while (residual > 1e-9) {
      const d = receivers().find((x) => km[x] + STEP <= top(x) + 1e-9)
      if (d == null) break
      km[d] += STEP
      residual -= STEP
    }
    // Too many km after rounding: take from easy/recovery days, then key slots; if every run sits at the minimum, drop
    // the smallest easy run and hand its km back (the long run stays — later weeks' spike checks rely on it).
    while (residual < -1e-9) {
      const d = [...receivers(), ...[1, 2, 3, 4, 5, 6, 7].filter((x) => role[x] === 'key')].find((x) => km[x] - STEP >= R.minRunKm - 1e-9)
      if (d != null) { km[d] -= STEP; residual += STEP; continue }
      const keys = [1, 2, 3, 4, 5, 6, 7].filter((x) => role[x] === 'key')
      const drop = receivers().sort((x, y) => km[x] - km[y])[0] ?? keys.sort((x, y) => km[x] - km[y])[0]
      if (drop == null) break
      residual += km[drop]
      km[drop] = 0
      role[drop] = 'rest'
      while (residual > 1e-9) {
        const r = receivers().find((x) => km[x] + STEP <= top(x) + 1e-9)
        if (r == null) break
        km[r] += STEP
        residual -= STEP
      }
    }
    // Which limit keeps the week below its target (for the warning).
    if (residual > 1e-9) for (const d of others()) if (km[d] + STEP > top(d) + 1e-9) { if (longest <= cap(d)) byLong = true; else capped = true }
  }
}
