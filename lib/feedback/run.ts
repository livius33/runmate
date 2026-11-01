// Run feedback (07-25): what the runner says about a run right after it. RPE 1–10 lives in activities.perceived_exertion
// (a Garmin re-sync keeps it: ENRICHMENT_OWNED_FIELDS); Gefühl, Schmerzen and the note live in settings 'run_feedback'
// as { v: 1, byActivity: { [activityId]: { feel, pain, note?, at } } } — the shared contract with 07-26/07-27.
// Pure (the cards import it); the DB side is run-store.ts.

export const FEELS = [1, 2, 3, 4, 5] as const
export type Feel = (typeof FEELS)[number]
export const PAINS = ['none', 'light', 'stop'] as const
export type Pain = (typeof PAINS)[number]

export const FEEL_LABEL: Record<Feel, string> = { 1: 'sehr schlecht', 2: 'schlecht', 3: 'okay', 4: 'gut', 5: 'sehr gut' }
export const PAIN_LABEL: Record<Pain, string> = { none: 'Keine', light: 'Leicht', stop: 'Stopp' }
export const RPE_MIN = 1
export const RPE_MAX = 10
export const NOTE_MAX = 280

export interface RunFeedbackEntry { feel: Feel; pain: Pain; note?: string; at: string }
export interface RunFeedbackStore { v: 1; byActivity: Record<string, RunFeedbackEntry> }
export const EMPTY_RUN_FEEDBACK: RunFeedbackStore = { v: 1, byActivity: {} }

export const isFeel = (v: unknown): v is Feel => typeof v === 'number' && (FEELS as readonly number[]).includes(v)
export const isPain = (v: unknown): v is Pain => typeof v === 'string' && (PAINS as readonly string[]).includes(v)
export const isRpe = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= RPE_MIN && v <= RPE_MAX

// What is stored; anything malformed is dropped entry by entry.
export function storedRunFeedback(raw: unknown): RunFeedbackStore {
  const by = raw && typeof raw === 'object' ? (raw as { byActivity?: unknown }).byActivity : null
  if (!by || typeof by !== 'object') return EMPTY_RUN_FEEDBACK
  const out: Record<string, RunFeedbackEntry> = {}
  for (const [id, e] of Object.entries(by as Record<string, Partial<RunFeedbackEntry> | null>)) {
    if (!e || !isFeel(e.feel) || !isPain(e.pain) || typeof e.at !== 'string') continue
    out[id] = { feel: e.feel, pain: e.pain, at: e.at, ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim().slice(0, NOTE_MAX) } : {}) }
  }
  return { v: 1, byActivity: out }
}

export interface FeedbackPatch { feel?: Feel | null; pain?: Pain | null; note?: string | null }

// One run's entry after a patch: null clears a field, undefined leaves it. An entry needs a Gefühl (the contract);
// pain defaults to 'none'; clearing the Gefühl removes the entry. Returns null when pain or note arrive before any Gefühl.
export function withEntry(store: RunFeedbackStore, id: string, patch: FeedbackPatch, at: string): RunFeedbackStore | null {
  const prev = store.byActivity[id]
  const feel = patch.feel === undefined ? prev?.feel : patch.feel
  const rest = Object.fromEntries(Object.entries(store.byActivity).filter(([k]) => k !== id))
  if (feel == null) {
    if (patch.feel === null) return { v: 1, byActivity: rest }
    return null
  }
  const pain = patch.pain === undefined ? prev?.pain ?? 'none' : patch.pain ?? 'none'
  const noteRaw = patch.note === undefined ? prev?.note : patch.note ?? undefined
  const note = noteRaw?.trim().slice(0, NOTE_MAX)
  return { v: 1, byActivity: { ...rest, [id]: { feel, pain, at, ...(note ? { note } : {}) } } }
}
