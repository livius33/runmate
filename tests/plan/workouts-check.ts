// Rules every generated workout plan must keep (07-13). German-labelled violations, like checkDays().
// Sources: methodologies/research/workouts-and-intensity.md (1.2, 2.2, 2.3, 3), long-run.md 3.2, phases-and-taper.md 2.3
// rules 3 and 5, paces.md 1.2.
import { addDays, format, parseISO } from 'date-fns'
import { SAFETY } from '@/lib/plan/methodology/safety'
import { parseStructure } from '@/lib/plan/structure'
import { WORKOUT_RULES, type WorkoutsInput, type WorkoutPlan } from '@/lib/plan/generator/workouts'
import type { DaysPlan } from '@/lib/plan/generator/days'
import type { Skeleton } from '@/lib/plan/generator/skeleton'

const fmt = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

export function checkWorkouts(plan: WorkoutPlan, days: DaysPlan, sk: Skeleton, input: WorkoutsInput): string[] {
  const out: string[] = []
  const W = WORKOUT_RULES
  const p = plan.paces
  const pace = (name: string) => fmt(p.paces[name])
  const raceName = input.distance === 'marathon' ? 'marathon_pace' : input.distance === 'half' ? 'half_marathon_pace' : null
  const raceIdx = sk.weeks.length - 1
  const raceWeekStart = sk.weeks[raceIdx].start
  const lastHardFrom = ymd(addDays(parseISO(input.raceDate), -W.lastHardDays[input.distance]))

  // Paces: race pace + template offsets.
  for (const [name, off] of Object.entries(input.template.paces.offsets)) {
    if (off != null && Math.abs(p.paces[name] - (p.racePaceS + off)) > 0.5) out.push(`Tempo ${name}: ${p.paces[name]} statt ${p.racePaceS + off}`)
  }

  // Days unchanged: same dates, types, km — except a quality slot made easy (no workout, or freshness before a test), which becomes an easy run
  // (07-21, audit finding 14), and the medium-long run, which stays the key but is an easy run.
  if (plan.sessions.length !== days.sessions.length) out.push('Anzahl Tage geändert')
  plan.sessions.forEach((s, i) => {
    const d = days.sessions[i]
    const relaxed = (d?.type === 'tempo' || d?.type === 'intervals') && s.type === 'easy' && !s.pace && (!s.key || s.title === 'Mittellanger Lauf')
    if (!d || s.date !== d.date || (s.type !== d.type && !relaxed) || (s.km ?? 0) !== (d.km ?? 0)) out.push(`${s.date}: Tag geändert (${d?.type} ${d?.km} → ${s.type} ${s.km})`)
  })

  const weekOf = (date: string) => sk.weeks.findIndex((w) => date >= w.start && date <= ymd(addDays(parseISO(w.start), 6)))
  const quality = new Map<number, number>()
  const blocks: boolean[] = []
  for (const s of plan.sessions) {
    if (s.type === 'race' || s.type === 'rest') continue
    const i = weekOf(s.date)
    const w = sk.weeks[i]
    if (s.type === 'long' && i < raceIdx && w.phase !== 'taper') blocks[i] = !!s.key && !s.test
    if (!s.key) { if (s.pace) out.push(`${s.date}: Tempo an einem lockeren Tag`); continue }
    if (!s.notes) { out.push(`${s.date}: Schlüsseleinheit ohne Inhalt`); continue }
    if (!s.pace) {
      if (s.type !== 'easy' && s.type !== 'tempo') out.push(`${s.date}: Schlüsseleinheit ohne Tempo`)
      continue
    }
    // Notes parse and add up to the day's km.
    const st = parseStructure(s.notes)
    if (!st) { out.push(`${s.date}: Aufbau nicht lesbar: ${s.notes}`); continue }
    const total = st.warmKm + st.reps * st.repKm + (st.reps - 1) * st.recKm + st.coolKm
    if (Math.abs(total - (s.km ?? 0)) > 0.01) out.push(`${s.date}: Aufbau ${total} km statt ${s.km} km`)
    if (st.pace !== s.pace) out.push(`${s.date}: Tempo im Text ${st.pace}, Feld ${s.pace}`)
    const q = st.reps * st.repKm
    const inRaceWeek = s.date >= raceWeekStart

    // Caps per session (Daniels defaults, SAFETY outer bound) — the race-week reminder and tests excepted from day caps.
    const capOf = s.pace === pace('threshold') ? W.cap.threshold * w.km
      : s.pace === pace('intervals_vo2') ? Math.min(W.cap.vo2 * w.km, W.cap.vo2Km)
      : s.pace === pace('marathon_pace') && input.distance === 'marathon' && !s.test ? Math.min(W.cap.marathonPace * w.km, W.cap.marathonPaceKm)
      : Infinity
    if (!s.test && !inRaceWeek && q > Math.min(capOf, SAFETY.qualityKmPerSessionMax * w.km) + 0.5) out.push(`${s.date}: ${q} km Qualität über der Grenze`)
    if (!s.test && q > (s.km ?? 0) - W.warmCoolMinKm + 1e-9) out.push(`${s.date}: zu wenig Ein- und Auslaufen`)
    if (!s.test && !inRaceWeek) quality.set(i, (quality.get(i) ?? 0) + q)

    // Race-specific pace only in the race-specific window; no hard session in the last days except the reminder.
    const weeksBefore = raceIdx - i
    const window = s.type === 'long' ? W.longPaceWeeks[input.distance] : W.raceSpecificWeeks[input.distance]
    if (raceName && s.pace === pace(raceName) && !s.test && !inRaceWeek && weeksBefore > window) out.push(`${s.date}: Renntempo ${weeksBefore} Wochen vor dem Rennen`)
    if (s.date >= lastHardFrom && !inRaceWeek) out.push(`${s.date}: harte Einheit in den letzten ${W.lastHardDays[input.distance]} Tagen`)
    if (inRaceWeek && q > W.reminder[input.distance].reps * W.reminder[input.distance].km + 1e-9) out.push(`${s.date}: Rennwoche ${q} km Renntempo`)
    if (s.test && s.pace !== fmt(p.racePaceS)) out.push(`${s.date}: Test nicht im Renntempo`)
  }

  // Weekly quality budget: (moderate + hard) × week km.
  for (const [i, q] of quality) {
    const w = sk.weeks[i]
    const it = input.template.intensity[w.phase]
    if (q > (it.moderate + it.hard) * w.km + 0.5) out.push(`KW ${w.kw}: ${q} km Qualität über ${(it.moderate + it.hard) * 100} % der Woche`)
  }
  // Long runs with race pace: never three weeks in a row.
  for (let i = 2; i < blocks.length; i++) if (blocks[i] && blocks[i - 1] && blocks[i - 2]) out.push(`KW ${sk.weeks[i].kw}: dritter Longrun mit Tempo in Folge`)
  // At most one Generalprobe and one Finaler Test.
  for (const name of ['Generalprobe', 'Finaler Test']) {
    const n = plan.sessions.filter((s) => s.test === name).length
    if (n > 1) out.push(`${n} × ${name}`)
  }
  return out
}
