// What a saved manual plan edit may contain (PUT /api/running/plan-overrides). It covers every PlanSession field an
// edit carries: zod drops unknown keys, so a field missing here is silently lost on save (the kettlebell marker was).
// `paused` is left out on purpose: it is derived from the Krank/Pause periods (lib/plan/pause.ts), never stored. Pure.
import { z } from 'zod'
import type { PlanSession } from './types'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const base = {
  date: DATE,
  type: z.enum(['easy', 'tempo', 'long', 'intervals', 'rest', 'race', 'recovery']),
  km: z.number().min(0).max(60).optional(),
  title: z.string().max(120),
  notes: z.string().max(1000).optional(),
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
