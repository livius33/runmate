// DB side of the run feedback (07-25): settings 'run_feedback' (lib/feedback/run.ts has the shape and the pure helpers).
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { EMPTY_RUN_FEEDBACK, storedRunFeedback, type RunFeedbackStore } from './run'

const KEY = 'run_feedback'

export async function loadRunFeedback(): Promise<RunFeedbackStore> {
  const raw = await getSettingJson<unknown>(KEY)
  return raw == null ? EMPTY_RUN_FEEDBACK : storedRunFeedback(raw)
}

export async function saveRunFeedback(store: RunFeedbackStore) {
  await setSettingJson(KEY, store)
}
