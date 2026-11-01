// One heart-rate model for the whole app.
// EXAMPLE DEFAULTS — not anyone's measured values: HFmax 190, resting HR 60, zones and race caps as shares of HFmax.
// Change HR_MAX / HR_REST to your own values until per-user profiles exist.
// TODO(Phase 2): a per-user profile (user_profile: HFmax, rest HR, LTHR) replaces these constants.
export const HR_MAX = 190
export const HR_REST = 60

const pct = (share: number) => Math.round(HR_MAX * share)

export const HR_ZONES = [
  { zone: 1, name: 'Z1', label: 'Regeneration', min: 0,          max: pct(0.65) },
  { zone: 2, name: 'Z2', label: 'Grundlage',    min: pct(0.65),  max: pct(0.71) },
  { zone: 3, name: 'Z3', label: 'Aerob',        min: pct(0.71),  max: pct(0.775) },
  { zone: 4, name: 'Z4', label: 'Schwelle',     min: pct(0.775), max: pct(0.85) },
  { zone: 5, name: 'Z5', label: 'VO2max',       min: pct(0.85),  max: 999 },
] as const

// Race-pace block HR per race distance (research paces.md §2.1): below `cap` = on course, from `hard` = too hard.
// Marathon: the cap is the Z4 top (ATHLETE.raceHrCap).
// `hard` is always 5 beats above `cap`.
export function raceHr(distanceKm: number): { cap: number; hard: number } {
  const cap = distanceKm > 30 ? pct(0.85) : distanceKm > 15 ? pct(0.89) : pct(0.925)
  return { cap, hard: cap + 5 }
}

// The HR cap of a paced block in a block preparing `race`: race-pace work (marathon: also anything slower than race
// pace; shorter races: up to 5 s/km slower) → the race cap; faster or threshold work → Z4 max.
export const isRacePaceWork = (paceS: number, race: { distanceKm: number; goalPaceS: number }) =>
  race.distanceKm > 30 ? paceS >= race.goalPaceS : paceS >= race.goalPaceS && paceS <= race.goalPaceS + 5
export function blockHrCap(paceS: number, race: { distanceKm: number; goalPaceS: number }) {
  return isRacePaceWork(paceS, race) ? raceHr(race.distanceKm).cap : HR_ZONES[3].max
}

export function zoneIndex(bpm: number) {
  return HR_ZONES.findIndex((z) => bpm >= z.min && bpm < z.max)
}
