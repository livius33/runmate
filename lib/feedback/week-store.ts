// Week feedback store (server only). Kept out of lib/feedback/week.ts, which client components import: a db import
// there would bundle the Postgres driver into the browser.
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { EMPTY_WEEK_FEEDBACK, WEEK_FEEDBACK_KEY, storedWeekFeedback, type WeekFeedback, type WeekFeedbackEntry } from '@/lib/feedback/week'

export async function loadWeekFeedback(): Promise<WeekFeedback> {
  const raw = await getSettingJson<unknown>(WEEK_FEEDBACK_KEY)
  return raw == null ? EMPTY_WEEK_FEEDBACK : storedWeekFeedback(raw)
}

// Merges one week into the stored map and returns the new whole.
export async function saveWeekFeedback(week: string, entry: WeekFeedbackEntry): Promise<WeekFeedback> {
  const current = await loadWeekFeedback()
  const next: WeekFeedback = { v: 1, byWeek: { ...current.byWeek, [week]: entry } }
  await setSettingJson(WEEK_FEEDBACK_KEY, next)
  return next
}
