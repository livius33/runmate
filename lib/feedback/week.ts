// Weekly feedback (07-26): the runner's own read of a finished plan week, stored in settings 'week_feedback'.
// Shared contract — 07-25 (adaptation suggestions) reads this key, so the shape stays exactly as it is here:
//   { v: 1, byWeek: Record<mondayYmd, { rating: 1–5, fatigue: 1–5, note?: string, at: ISO }> }
import { z } from 'zod'

export const WEEK_FEEDBACK_KEY = 'week_feedback'
export const NOTE_MAX = 500

export type Score = 1 | 2 | 3 | 4 | 5

export interface WeekFeedbackEntry {
  rating: Score           // Woche: 1 = schlecht … 5 = sehr gut
  fatigue: Score          // Müdigkeit: 1 = frisch … 5 = erschöpft
  note?: string
  at: string              // ISO time the rating was saved
}

export interface WeekFeedback {
  v: 1
  byWeek: Record<string, WeekFeedbackEntry>   // key = Monday 'YYYY-MM-DD'
}

export const EMPTY_WEEK_FEEDBACK: WeekFeedback = { v: 1, byWeek: {} }

const score = z.number().int().min(1).max(5)
export const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const WeekFeedbackEntrySchema = z.object({
  rating: score,
  fatigue: score,
  note: z.string().max(NOTE_MAX).optional(),
  at: z.string().datetime({ offset: true }),
})
export const WeekFeedbackSchema = z.object({ v: z.literal(1), byWeek: z.record(Ymd, WeekFeedbackEntrySchema) })

// Whatever is stored → a valid WeekFeedback; unreadable entries are dropped, never the whole key.
export function storedWeekFeedback(raw: unknown): WeekFeedback {
  const whole = WeekFeedbackSchema.safeParse(raw)
  if (whole.success) return whole.data as WeekFeedback
  const byWeek: Record<string, WeekFeedbackEntry> = {}
  const obj = raw && typeof raw === 'object' ? (raw as { byWeek?: unknown }).byWeek : null
  if (obj && typeof obj === 'object') {
    for (const [week, entry] of Object.entries(obj as Record<string, unknown>)) {
      if (!Ymd.safeParse(week).success) continue
      const e = WeekFeedbackEntrySchema.safeParse(entry)
      if (e.success) byWeek[week] = e.data as WeekFeedbackEntry
    }
  }
  return { v: 1, byWeek }
}

// One rating → the entry to store: note trimmed, empty note dropped.
export function feedbackEntry(input: { rating: Score; fatigue: Score; note?: string | null }, at = new Date().toISOString()): WeekFeedbackEntry {
  const note = input.note?.trim()
  return { rating: input.rating, fatigue: input.fatigue, ...(note ? { note } : {}), at }
}

// A week can be rated once it has ended and is a plan week (named by its Monday).
export function weekError(week: string, today: string, weeks: { start: string; end: string }[]): string | null {
  const w = weeks.find((x) => x.start === week)
  if (!w) return 'Die Woche muss ein Montag im Plan sein.'
  if (w.end >= today) return 'Die Woche ist noch nicht vorbei.'
  return null
}

// German labels for the two scales (the UI and the feedback loop share them).
export const RATING_LABEL: Record<Score, string> = { 1: 'schlecht', 2: 'mäßig', 3: 'okay', 4: 'gut', 5: 'sehr gut' }
export const FATIGUE_LABEL: Record<Score, string> = { 1: 'frisch', 2: 'leicht müde', 3: 'müde', 4: 'sehr müde', 5: 'erschöpft' }

// ─── Store (server only; the db module is loaded on first use so pure callers and tests never touch it) ───────────

async function table() {
  const [{ db }, { settings }, { eq }] = await Promise.all([import('@/lib/db'), import('@/lib/db/schema'), import('drizzle-orm')])
  return { db, settings, eq }
}

export async function loadWeekFeedback(): Promise<WeekFeedback> {
  const { db, settings, eq } = await table()
  const [row] = await db.select().from(settings).where(eq(settings.key, WEEK_FEEDBACK_KEY))
  if (!row) return EMPTY_WEEK_FEEDBACK
  try { return storedWeekFeedback(JSON.parse(row.value)) } catch { return EMPTY_WEEK_FEEDBACK }
}

// Merges one week into the stored map and returns the new whole.
export async function saveWeekFeedback(week: string, entry: WeekFeedbackEntry): Promise<WeekFeedback> {
  const { db, settings } = await table()
  const current = await loadWeekFeedback()
  const next: WeekFeedback = { v: 1, byWeek: { ...current.byWeek, [week]: entry } }
  const value = JSON.stringify(next)
  await db.insert(settings).values({ key: WEEK_FEEDBACK_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return next
}
