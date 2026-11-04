// Kettlebell days in the plan: a marker on a plan day ("after the run: 30–40 min, RPE 5–8") on the profile's kettlebell
// weekdays, placed by fixed rules, editable per day, done when a Strength or Gym session (any source or logged by hand)
// exists that day. Markers carry no km, no key and no hard flag: week volumes, the engine and ruleWarnings never read
// them. Hand-written blocks (plan files) are used as written: no markers are placed in them. Pure.
import { addDays, format, parseISO } from 'date-fns'
import type { AthleteProfile, Weekday } from './athlete-profile'
import type { PlanSession, PlanWeek, TrainingBlock } from './types'

export type Strength = NonNullable<PlanSession['strength']>

export const KB = {
  regularDays: 2,                        // the first two chosen days are regular; every further one is optional
  regular: { minMin: 30, maxMin: 40 },
  optional: { minMin: 20, maxMin: 30, optional: true },
  rpe: [5, 8] as const,
  noBeforeKeyDays: 2,                    // no marker on the 2 days before a key long run, a test or a race
  doneTypes: ['Strength', 'Gym'] as string[],
}

const plus = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')

// The kettlebell weekdays from the profile; none without a profile or with an empty choice.
export function kbDaysOf(profile: AthleteProfile | null): Weekday[] {
  return [...new Set(profile?.kbDays ?? [])].sort((a, b) => a - b)
}

// none: race week, first recovery week · first: lighter weeks (cutback, taper before race week, minor-race week) get the
// first day only · regular: later recovery weeks without the optional day · all: every chosen day.
export type KbWeek = 'none' | 'first' | 'regular' | 'all'
export function kbWeek(w: PlanWeek, block: TrainingBlock): KbWeek {
  if (!block.base && w.start <= block.race.date && block.race.date <= w.end) return 'none'
  if (w.recovery) return block.weeks.find((x) => x.recovery)?.start === w.start ? 'none' : 'regular'
  if (w.taper || w.cutback || w.light) return 'first'
  return 'all'
}

// A day the next days must be kept fresh for.
export const isKeyDay = (s?: PlanSession) => !!s && (s.type === 'race' || !!s.anchor || !!s.test || (s.type === 'long' && (!!s.key || !!s.pace)))
// Kettlebell goes after a run, never on a rest day, a race or a test (or a key long run) itself.
const onRun = (s?: PlanSession) => !!s && s.type !== 'rest' && (s.km ?? 0) > 0 && !s.paused && !isKeyDay(s)

// A session with or without a marker (no `strength: undefined` keys).
export function withStrength(s: PlanSession, k: Strength | null | undefined): PlanSession {
  const { strength: _old, ...rest } = s
  return k ? { ...rest, strength: { ...k } } : rest
}

// Markers for a whole block, from scratch (idempotent: old markers are dropped first). A hand-written block is returned
// unchanged (its file may set markers itself).
export function placeStrength(block: TrainingBlock, days: Weekday[]): TrainingBlock {
  if (block.handWritten) return block
  const byDate = new Map(block.sessions.map((s) => [s.date, s]))
  const marks = new Map<string, Strength>()
  for (const w of block.weeks) {
    const kind = kbWeek(w, block)
    if (kind === 'none') continue
    days.forEach((d, i) => {
      const optional = i >= KB.regularDays
      if ((kind === 'first' && i > 0) || (kind === 'regular' && optional)) return
      const date = plus(w.start, d - 1)
      if (!onRun(byDate.get(date))) return
      for (let k = 1; k <= KB.noBeforeKeyDays; k++) if (isKeyDay(byDate.get(plus(date, k)))) return
      marks.set(date, optional ? KB.optional : KB.regular)
    })
  }
  return { ...block, sessions: block.sessions.map((s) => withStrength(s, marks.get(s.date))) }
}

// ─── Done check ───────────────────────────────────────────────────────────────

export interface KbRow { date: string; type: string }
export const strengthDone = (date: string, rows: KbRow[]) => rows.some((r) => r.date === date && KB.doneTypes.includes(r.type))
export const kbDoneDates = (rows: KbRow[]) => new Set(rows.filter((r) => KB.doneTypes.includes(r.type)).map((r) => r.date))

// planned (grey) · optional (grey, lighter) · done · skipped ("ausgelassen": past, covered by a sync, not optional).
export type KbMark = 'planned' | 'optional' | 'done' | 'skipped'
export function strengthMark(s: PlanSession | undefined, today: string, done: boolean, syncedThrough: string | null): KbMark | null {
  if (!s?.strength || s.paused) return null
  if (done) return 'done'
  if (!s.strength.optional && s.date < today && syncedThrough != null && s.date <= syncedThrough) return 'skipped'
  return s.strength.optional ? 'optional' : 'planned'
}

// Week count: regular markers plus optional ones that were done ("Kettlebell 1/2"); null without markers.
export function strengthWeek(dates: string[], sessions: PlanSession[], done: Set<string>): { planned: number; done: number } | null {
  const marked = sessions.filter((s) => dates.includes(s.date) && s.strength && !s.paused)
  if (!marked.length) return null
  const isDone = (s: PlanSession) => done.has(s.date)
  return { planned: marked.filter((s) => !s.strength!.optional || isDone(s)).length, done: marked.filter(isDone).length }
}

// Last day a sync fully covers: the day before the latest successful sync, as the runner's date (as engine-store's
// loadSyncedThrough). `localDate` maps an instant to that date (todayLocal).
export function syncedThroughOf(last: { at: string; error?: unknown } | null | undefined, localDate: (d: Date) => string): string | null {
  if (!last?.at || last.error || Number.isNaN(Date.parse(last.at))) return null
  return plus(localDate(new Date(last.at)), -1)
}

// ─── Texts ────────────────────────────────────────────────────────────────────

const range = (k: Strength) => `${k.minMin}–${k.maxMin} Min.`
const rpe = `RPE ${KB.rpe[0]}–${KB.rpe[1]}`

export function strengthDetail(s: PlanSession): string | null {
  const k = s.strength
  if (!k) return null
  const head = s.type === 'rest' ? 'Kettlebell' : 'Kettlebell nach dem Lauf'
  return `${head}: ${range(k)}, ${rpe}${k.optional ? ', optional, wenn die Beine gut sind' : ''}`
}

// The Heute-Karte line; tired (TSB/ACWR red zone) → skip it.
export function strengthToday(s: PlanSession, tiredWhy: string | null): string | null {
  const k = s.strength
  if (!k) return null
  if (tiredWhy) return `Kettlebell heute auslassen (${tiredWhy}).`
  const when = s.type === 'rest' ? 'Heute' : 'Danach'
  return k.optional
    ? `${when} optional Kettlebell ${range(k)} (${rpe}), wenn die Beine gut sind.`
    : `${when} Kettlebell ${range(k)} (${rpe}).`
}
