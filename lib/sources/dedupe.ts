// The same activity often arrives twice: a run synced from Garmin and imported again from the Garmin export, or
// recorded by the watch and also sent by the Apple Health Shortcut. Two activities are the same when they started
// within ±2 minutes and their distances differ by at most 3 %, whatever source each came from. Pure.
// Which of the two is kept: isRicher below.

export const START_TOLERANCE_S = 120
export const DISTANCE_TOLERANCE = 0.03

export interface DedupeKey {
  startedAt: number | null   // UTC epoch seconds
  startLocal: string | null  // 'YYYY-MM-DDTHH:MM:SS' (rows without a UTC start, e.g. migrated ones)
  distanceM: number
}

const localSeconds = (t: string | null) => {
  if (!t) return null
  const ms = Date.parse(`${t.slice(0, 19)}Z`)
  return Number.isFinite(ms) ? ms / 1000 : null
}

export function isDuplicate(a: DedupeKey, b: DedupeKey): boolean {
  const [x, y] = a.startedAt != null && b.startedAt != null
    ? [a.startedAt, b.startedAt]
    : [localSeconds(a.startLocal), localSeconds(b.startLocal)]
  if (x == null || y == null || Math.abs(x - y) > START_TOLERANCE_S) return false
  const longer = Math.max(a.distanceM, b.distanceM)
  return Math.abs(a.distanceM - b.distanceM) <= longer * DISTANCE_TOLERANCE
}

// When the same activity arrives a second time, the richer record wins: detail data (streams or laps) first, then the
// number of stream channels (when both are known), then heart rate. A tie keeps the record that came first.
export interface Richness {
  detail: boolean            // streams or laps (or, for a pull source, detail it will fetch)
  channels: number | null    // stream channels with data; null = detail still to be fetched, not known yet
  hr: boolean
}

export function isRicher(incoming: Richness, existing: Richness): boolean {
  if (incoming.detail !== existing.detail) return incoming.detail
  if (incoming.channels != null && existing.channels != null && incoming.channels !== existing.channels) return incoming.channels > existing.channels
  return incoming.hr && !existing.hr
}
