// Read-only view of the weekly feedback (07-26 owns the writer and lib/feedback/week.ts): settings 'week_feedback'
// = { v: 1, byWeek: { [mondayYmd]: { rating: 1–5, fatigue: 1–5, note?, at } } }. Malformed entries are dropped.
import { getSettingJson } from '@/lib/db/settings'
import { storedWeekFeedback, type WeekFeedbackEntry } from './rules'

const KEY = 'week_feedback'

export async function loadWeekFeedback(): Promise<Record<string, WeekFeedbackEntry>> {
  const raw = await getSettingJson<unknown>(KEY)
  return raw == null ? {} : storedWeekFeedback(raw)
}
