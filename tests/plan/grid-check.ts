// Invariants of a whole generated draft and of the block frozen from it (08): the checks the three step checkers
// (skeleton-check, days-check, workouts-check) do not make — calendar shape, week sums, readable texts, pace order, the
// recovery weeks after the race and the kettlebell markers. German-labelled violations, like the step checkers.
// Violations that start with "Form · " concern the shape of the weekly km (taper and cutback weeks against the load
// before them, the week against its skeleton); very low day limits still break them, see generator-grid.test.ts.
import { addDays, format, getISODay, parseISO } from 'date-fns'
import type { Draft, DraftChoice } from '@/lib/plan/generator/draft'
import { availableRunDays, DAY_RULES } from '@/lib/plan/generator/days'
import { POST_RACE } from '@/lib/plan/generator/recovery'
import { SAFETY } from '@/lib/plan/methodology/safety'
import { parseStructure } from '@/lib/plan/structure'
import type { PlanSession, PlanWeek, TrainingBlock } from '@/lib/plan/types'

const plus = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const isRun = (s: PlanSession) => s.type !== 'rest' && s.type !== 'race'
const runKm = (s: PlanSession) => (isRun(s) ? s.km ?? 0 : 0)
const PACE = /^\d{1,2}:[0-5]\d$/
const BROKEN = /NaN|undefined|null|Infinity|\[object|-\d|\d\.\d|(^|[^\d,])0 (km|ein|aus|locker|ausrollen|×)|× 0/

// Texts a runner reads: no broken numbers, German decimal comma, nothing negative, nothing empty.
function textErrors(s: PlanSession): string[] {
  const out: string[] = []
  if (!s.title?.trim()) out.push(`${s.date}: leerer Titel`)
  for (const [k, v] of [['Titel', s.title], ['Notiz', s.notes ?? '']] as const) {
    if (BROKEN.test(v)) out.push(`${s.date}: ${k} mit kaputter Zahl: ${v}`)
  }
  if (s.pace != null && !PACE.test(s.pace)) out.push(`${s.date}: Tempo ${s.pace}`)
  return out
}

function calendarErrors(weeks: PlanWeek[], sessions: PlanSession[]): string[] {
  const out: string[] = []
  weeks.forEach((w, i) => {
    if (getISODay(parseISO(w.start)) !== 1) out.push(`Woche ${i + 1} beginnt nicht am Montag (${w.start})`)
    if (w.end !== plus(w.start, 6)) out.push(`Woche ${i + 1} endet ${w.end}`)
    if (i > 0 && w.start !== plus(weeks[i - 1].start, 7)) out.push(`Woche ${i + 1}: Lücke nach ${weeks[i - 1].start}`)
    const days = sessions.filter((s) => s.date >= w.start && s.date <= w.end)
    if (days.length !== 7) out.push(`Woche ${w.start}: ${days.length} Tage`)
    const sum = days.reduce((a, s) => a + runKm(s), 0)
    if (!Number.isFinite(w.km) || Math.abs(sum - w.km) > 0.051) out.push(`Woche ${w.start}: ${w.km} km, Summe der Tage ${sum}`)
  })
  sessions.forEach((s, i) => {
    if (s.date !== plus(weeks[0].start, i)) out.push(`Tag ${i + 1}: ${s.date}`)
    if (s.km != null && (!Number.isFinite(s.km) || s.km < 0)) out.push(`${s.date}: ${s.km} km`)
    if (isRun(s) && !((s.km ?? 0) > 0)) out.push(`${s.date}: ${s.type} ohne km`)
    if (s.type === 'rest' && (s.km ?? 0) > 0) out.push(`${s.date}: Ruhetag mit ${s.km} km`)
    out.push(...textErrors(s))
  })
  return out
}

export function checkDraft(d: Draft, c: DraftChoice): string[] {
  const out: string[] = []
  const t = c.template
  const profile = c.profile ?? DAY_RULES.defaultProfile
  const avail = new Set<number>(availableRunDays(c.profile))
  const cap = (date: string) => (getISODay(parseISO(date)) >= 6 ? profile.maxKmWeekend : profile.maxKmWeekday) ?? Infinity
  const weeks = d.days.weeks
  const sessions = d.workouts.sessions
  out.push(...calendarErrors(weeks, sessions))

  // The race: once, on the race date, in the last week; nothing but rest after it.
  const races = sessions.filter((s) => s.type === 'race')
  if (races.length !== 1 || races[0].date !== c.goal.date) out.push(`Rennen: ${races.map((s) => s.date).join(', ') || 'keins'} statt ${c.goal.date}`)
  if (!(weeks[weeks.length - 1].start <= c.goal.date && c.goal.date <= weeks[weeks.length - 1].end)) out.push('Das Rennen liegt nicht in der letzten Woche')
  for (const s of sessions) if (s.date > c.goal.date && s.type !== 'rest') out.push(`${s.date}: ${s.type} nach dem Rennen`)

  // Days: available, under the daily cap, in 0,5-km steps; a workout that adds up, with every part positive.
  for (const s of sessions) {
    if (!isRun(s)) continue
    const km = s.km ?? 0
    if (!avail.has(getISODay(parseISO(s.date)))) out.push(`${s.date}: Lauf an einem nicht verfügbaren Tag`)
    if (km > cap(s.date) + 1e-9) out.push(`${s.date}: ${km} km über dem Tageslimit ${cap(s.date)} km`)
    if (Math.abs(km * 2 - Math.round(km * 2)) > 1e-9) out.push(`${s.date}: ${km} km nicht in 0,5-km-Schritten`)
    if (s.key && !s.notes) out.push(`${s.date}: Schlüsseleinheit ohne Inhalt`)
    if (s.pace) {
      const st = parseStructure(s.notes)
      if (!st) out.push(`${s.date}: Aufbau nicht lesbar: ${s.notes}`)
      else if (st.warmKm <= 0 || st.coolKm <= 0 || st.repKm <= 0 || st.reps < 1) out.push(`${s.date}: Aufbau mit leerem Teil: ${s.notes}`)
      else if (Math.abs(st.warmKm + st.reps * st.repKm + (st.reps - 1) * st.recKm + st.coolKm - km) > 0.01) out.push(`${s.date}: Aufbau ergibt nicht ${km} km: ${s.notes}`)
    }
  }

  // Never two hard days in a row unless the template allows touching key days (key_gap_days 1), never three.
  const hard = (s?: PlanSession) => !!s && s.type !== 'race' && (!!s.key || s.type === 'tempo' || s.type === 'intervals' || (s.type === 'long' && (s.km ?? 0) >= SAFETY.longRunMinKmForHard))
  for (let i = 1; i < sessions.length; i++) {
    if (!hard(sessions[i]) || !hard(sessions[i - 1])) continue
    if (t.week.key_gap_days >= 2) out.push(`${sessions[i].date}: zwei harte Tage hintereinander`)
    else if (hard(sessions[i - 2])) out.push(`${sessions[i].date}: drei harte Tage hintereinander`)
  }

  // Weeks: the plan never exceeds its skeleton; recovery and taper weeks are lighter than the load before them.
  let lastLoad: number | null = null
  d.skeleton.weeks.forEach((w, i) => {
    const km = weeks[i].km
    if (km > w.km + 1e-9) out.push(`Form · Woche ${w.start}: ${km} km über dem Gerüst ${w.km} km`)
    if (w.kind === 'load') lastLoad = km
    else if (lastLoad != null && lastLoad > 0 && km > lastLoad + 1e-9) out.push(`Form · Woche ${w.start}: ${w.kind} ${km} km über der letzten Belastungswoche ${lastLoad} km`)
  })
  const raceWeek = weeks[weeks.length - 1]
  const peak = Math.max(...weeks.map((w) => w.km))
  if (weeks.length > 1 && raceWeek.km >= peak && peak > 0) out.push(`Form · Rennwoche ${raceWeek.km} km ist die größte Woche`)

  // Paces: ordered slow → fast, plausible, formatted. (Threshold against half-marathon pace is left out: the templates'
  // offsets put it on either side.)
  const p = d.paces.paces
  const order = ['recovery', 'easy', 'marathon_pace', 'threshold', 'intervals_vo2', 'strides'].filter((n) => t.paces.offsets[n as keyof typeof t.paces.offsets] != null)
  for (let i = 1; i < order.length; i++) if (p[order[i]] > p[order[i - 1]]) out.push(`Tempo ${order[i]} (${p[order[i]]}) langsamer als ${order[i - 1]} (${p[order[i - 1]]})`)
  for (const [name, v] of Object.entries(p)) {
    if (!Number.isFinite(v) || v < 100 || v > 900) out.push(`Tempo ${name}: ${v} s/km`)
    if (!PACE.test(d.paces.fmt[name])) out.push(`Tempo ${name}: ${d.paces.fmt[name]}`)
  }

  // Recovery after the race: on available days, under the cap, lighter than the last load week, the day after the race free.
  const rec = d.recovery
  if (rec) {
    out.push(...calendarErrors(rec.weeks, rec.sessions).map((x) => `Erholung · ${x}`))
    if (rec.weeks[0] && rec.weeks[0].start !== plus(raceWeek.start, 7)) out.push(`Erholung beginnt ${rec.weeks[0].start}`)
    const load = [...weeks].reverse().find((w) => !w.taper && !w.cutback)
    rec.weeks.forEach((w, k) => { if (load && w.km > POST_RACE.shares[d.distance][k] * load.km + 1e-9) out.push(`Form · Erholung · Woche ${w.start}: ${w.km} km über ${POST_RACE.shares[d.distance][k]} × ${load.km} km`) })
    for (const s of rec.sessions) {
      if (!isRun(s)) continue
      if (!avail.has(getISODay(parseISO(s.date)))) out.push(`Erholung · ${s.date}: Lauf an einem nicht verfügbaren Tag`)
      if ((s.km ?? 0) > cap(s.date) + 1e-9) out.push(`Erholung · ${s.date}: ${s.km} km über dem Tageslimit ${cap(s.date)} km`)
      if (s.date === plus(c.goal.date, 1)) out.push(`Erholung · ${s.date}: Lauf am Tag nach dem Rennen`)
      if (s.pace) {
        const st = parseStructure(s.notes)
        if (!st || st.warmKm <= 0 || st.coolKm <= 0 || st.repKm <= 0) out.push(`Erholung · ${s.date}: Aufbau ${s.notes}`)
        else if (Math.abs(st.warmKm + st.repKm + st.coolKm - (s.km ?? 0)) > 0.01) out.push(`Erholung · ${s.date}: Aufbau ergibt nicht ${s.km} km: ${s.notes}`)
      }
    }
  }

  // Kettlebell markers: only on chosen weekdays, after a run, never in race week or on/just before a race or test.
  const kb = new Set<number>(c.profile?.kbDays ?? [])
  const all = [...sessions, ...(rec?.sessions ?? [])]
  all.forEach((s, i) => {
    if (!s.strength) return
    if (!kb.has(getISODay(parseISO(s.date)))) out.push(`${s.date}: Kettlebell an einem nicht gewählten Tag`)
    if (!isRun(s) || !((s.km ?? 0) > 0)) out.push(`${s.date}: Kettlebell ohne Lauf`)
    if (s.date >= raceWeek.start && s.date <= raceWeek.end) out.push(`${s.date}: Kettlebell in der Rennwoche`)
    if (s.test || [1, 2].some((k) => all[i + k]?.type === 'race' || all[i + k]?.test)) out.push(`${s.date}: Kettlebell vor einem Rennen oder Test`)
  })
  return out
}

// The frozen block: the draft's days and recovery weeks, unchanged, from planStart to end.
export function checkBlock(b: TrainingBlock, d: Draft, c: DraftChoice): string[] {
  const out = calendarErrors(b.weeks, b.sessions).map((x) => `Block · ${x}`)
  if (b.planStart !== b.weeks[0].start || b.end !== b.weeks[b.weeks.length - 1].end) out.push(`Block · ${b.planStart}–${b.end}`)
  if (b.race.date !== c.goal.date) out.push(`Block · Renndatum ${b.race.date}`)
  for (const v of [b.race.goalS, b.race.goalPaceS, b.race.fallbackS, b.race.fallbackPaceS]) if (!Number.isFinite(v) || v <= 0) out.push(`Block · Rennwert ${v}`)
  if (b.race.fallbackS < b.race.goalS) out.push('Block · Plan B schneller als Plan A')
  const preview = [...d.workouts.sessions, ...(d.recovery?.sessions ?? [])]
  b.sessions.forEach((s, i) => {
    const want = preview[i]
    const same = want && JSON.stringify({ ...want, title: s.title, anchor: s.anchor }) === JSON.stringify({ ...s })
    if (!same) out.push(`Block · ${s.date}: weicht vom Entwurf ab`)
  })
  for (const r of b.rules) if (BROKEN.test(r) || !r.trim()) out.push(`Block · Regel: ${r}`)
  for (const [k, v] of Object.entries(b.paces ?? {})) if (!PACE.test(v)) out.push(`Block · Tempo ${k}: ${v}`)
  return out
}
