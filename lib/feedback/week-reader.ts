// Read-only view of the weekly feedback (07-26 owns the writer and lib/feedback/week.ts): settings 'week_feedback'
// = { v: 1, byWeek: { [mondayYmd]: { rating: 1–5, fatigue: 1–5, note?, at } } }. Malformed entries are dropped.
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { storedWeekFeedback, type WeekFeedbackEntry } from './rules'

const KEY = 'week_feedback'

export async function loadWeekFeedback(): Promise<Record<string, WeekFeedbackEntry>> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  if (!row) return {}
  try { return storedWeekFeedback(JSON.parse(row.value)) } catch { return {} }
}
