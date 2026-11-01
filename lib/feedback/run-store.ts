// DB side of the run feedback (07-25): settings 'run_feedback' (lib/feedback/run.ts has the shape and the pure helpers).
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { EMPTY_RUN_FEEDBACK, storedRunFeedback, type RunFeedbackStore } from './run'

const KEY = 'run_feedback'

export async function loadRunFeedback(): Promise<RunFeedbackStore> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  if (!row) return EMPTY_RUN_FEEDBACK
  try { return storedRunFeedback(JSON.parse(row.value)) } catch { return EMPTY_RUN_FEEDBACK }
}

export async function saveRunFeedback(store: RunFeedbackStore) {
  const value = JSON.stringify(store)
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}
