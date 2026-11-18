// What a saved manual plan edit may contain (PUT /api/running/plan-overrides). It covers every PlanSession field an
// edit carries: zod drops unknown keys, so a field missing here is silently lost on save (the kettlebell marker was).
// `paused` is left out on purpose: it is derived from the Krank/Pause periods (lib/plan/pause.ts), never stored. Pure.
import { z } from 'zod'
import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { planWeeks, weekDates, type Overrides } from './effective'
import type { PlanSession } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATE = z.string().regex(DATE_RE)
export const NOTES_MAX = 1000
const base = {
  date: DATE,
  type: z.enum(['easy', 'tempo', 'long', 'intervals', 'rest', 'race', 'recovery']),
  km: z.number().min(0).max(60).optional(),
  title: z.string().max(120),
  notes: z.string().max(NOTES_MAX).optional(),
  pace: z.string().max(10).optional(),
  key: z.boolean().optional(),
  test: z.string().max(40).optional(),
  anchor: z.boolean().optional(),
  strength: z.object({
    minMin: z.number().int().min(5).max(120),
    maxMin: z.number().int().min(5).max(120),
    optional: z.boolean().optional(),
  }).optional(),
  strengthOnly: z.boolean().optional(),
}
// `was`: the pace session behind a Zone 2 day, one level deep (a kept session keeps no further one).
export const SavedSession = z.object({ ...base, was: z.object(base).optional() })
export const SavedOverrides = z.record(DATE, SavedSession)

// Compile-time guard: a field added to PlanSession must be added above or listed here as never stored.
type NeverStored = 'paused'
type Missing = Exclude<keyof PlanSession, keyof z.infer<typeof SavedSession> | NeverStored>
const _allFieldsCovered: Missing extends never ? true : never = true
void _allFieldsCovered

// ─── Which days a save may write ──────────────────────────────────────────────

// A day of the plan's weeks, past ones included (the editor shows every week of the plan and edits any of its days), or
// a day within two weeks of today: that far the editor moves a session (WeekEditor: today … today + 13), also onto a
// day outside the plan's weeks. Anything else is far from the plan or no calendar day at all.
const MOVE_REACH_DAYS = 14

// The days of `next` a save may not write. Every save sends the whole map, so an entry stored before passes as long as
// it is unchanged: edits of a block that has ended or gone offline must not block every later save.
export function daysOutsidePlan(next: Overrides, stored: Overrides, today: string): string[] {
  const inPlan = new Set(planWeeks().flatMap(weekDates))
  const canon = (s: unknown) => { const p = SavedSession.safeParse(s); return JSON.stringify(p.success ? p.data : s) }   // same key order
  return Object.keys(next).filter((d) => {
    if (stored[d] && canon(stored[d]) === canon(next[d])) return false
    const t = parseISO(d)
    return !isValid(t) || !(inPlan.has(d) || Math.abs(differenceInCalendarDays(t, parseISO(today))) <= MOVE_REACH_DAYS)
  }).sort()
}

// A day for an error message, with the year (it may be far away); a date that does not exist stays as written.
const dayText = (d: string) => (isValid(parseISO(d)) ? format(parseISO(d), 'EEE d.M.yyyy', { locale: de }) : d)

export const outsidePlanError = (days: string[]) => `Kein Tag im Plan: ${days.map(dayText).join(', ')}.`

// Why the schema refused a save, for the runner. One invalid day fails the whole save (every save sends all edits), so
// the message names the day. A note over the limit comes first: the editor builds notes itself (the plan's text plus
// what was moved, merged or added), so that one can happen without any typing. Nothing is cut on the server.
export function saveError(issues: z.ZodIssue[]): string {
  const dayOf = (i?: z.ZodIssue) => i?.path.find((p): p is string => typeof p === 'string' && DATE_RE.test(p))
  const note = issues.find((i) => i.code === 'too_big' && i.path.at(-1) === 'notes' && dayOf(i))
  if (note) return `Die Notiz am ${dayText(dayOf(note)!)} ist zu lang (höchstens ${NOTES_MAX} Zeichen).`
  const day = dayOf(issues[0])
  return day ? `Die Änderung am ${dayText(day)} ist ungültig.` : 'Die Änderung ist ungültig.'
}
