// The profile the example block's tests and the plan snapshot run with: the HR model and time zone Runmate shipped with
// before per-user profiles (HFmax 190, resting HR 60, Europe/Berlin). Not the Porto runner's measured values.
import type { UserProfile } from '@/lib/profile'

export const EXAMPLE_PROFILE: Partial<UserProfile> = { hrMax: 190, hrRest: 60, timezone: 'Europe/Berlin' }
