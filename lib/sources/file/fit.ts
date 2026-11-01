// .FIT (Garmin, COROS, Polar, Suunto, Wahoo …) via fit-file-parser (MIT). Sessions give the totals, records the
// samples, laps the laps. A file can hold several sessions (multisport); each becomes its own activity.
import FitParser from 'fit-file-parser'
import type { Lap, ParsedActivity } from '@/lib/sources/types'
import { buildStreams, summarise, type Sample } from './streams'

type Rec = Record<string, any>

const ms = (d: unknown) => (d instanceof Date ? d.getTime() : typeof d === 'string' || typeof d === 'number' ? new Date(d).getTime() : NaN)
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// FIT sport / sub_sport → Garmin-style key (lib/sources/sports.ts).
export function fitSport(sport: unknown, subSport: unknown): string {
  const sp = String(sport ?? 'generic'), sub = String(subSport ?? 'generic')
  if (sp === 'running') {
    if (sub === 'trail') return 'trail_running'
    if (sub === 'treadmill' || sub === 'indoor_running') return 'treadmill_running'
    if (sub === 'track') return 'track_running'
    if (sub === 'virtual_activity') return 'virtual_run'
    return 'running'
  }
  if (sp === 'cycling') return sub === 'indoor_cycling' || sub === 'virtual_activity' ? 'indoor_cycling' : 'cycling'
  if (sp === 'swimming') return sub === 'open_water' ? 'open_water_swimming' : 'lap_swimming'
  if (sp === 'training' || sp === 'fitness_equipment') {
    if (sub === 'strength_training') return 'strength_training'
    if (sub === 'cardio_training') return 'cardio_training'
    if (sub === 'elliptical') return 'elliptical'
    if (sub === 'stair_climbing') return 'stair_climbing'
    if (sub === 'indoor_rowing') return 'indoor_rowing'
    return sp === 'training' ? 'cardio_training' : 'fitness_equipment'
  }
  if (sp === 'rowing') return 'rowing'
  if (sp === 'hiit') return 'hiit'
  return sp
}

export async function parseFit(bytes: Uint8Array, id: string, zone: string): Promise<ParsedActivity[]> {
  const data = (await new FitParser({ mode: 'list', force: true, lengthUnit: 'm', speedUnit: 'm/s' })
    .parseAsync(Buffer.from(bytes))) as Rec
  const records: Rec[] = data.records ?? []
  const laps: Rec[] = data.laps ?? []
  const act: Rec | undefined = Array.isArray(data.activity) ? data.activity[0] : data.activity
  // The watch's own local time (travel): local_timestamp − timestamp.
  const offsetS = act && act.local_timestamp && act.timestamp ? Math.round((ms(act.local_timestamp) - ms(act.timestamp)) / 1000) : null
  const tz = offsetS != null && Math.abs(offsetS) <= 14 * 3600 ? { offsetS } : { zone }

  let sessions: Rec[] = data.sessions ?? []
  if (!sessions.length && records.length) sessions = [{ start_time: records[0].timestamp, sport: 'running' }]

  return sessions.flatMap((ses, i): ParsedActivity[] => {
    const start = ms(ses.start_time ?? ses.timestamp)
    const elapsed = n(ses.total_elapsed_time)
    const end = elapsed != null ? start + elapsed * 1000 : Infinity
    const inSession = (t: number) => t >= start - 1000 && t <= end + 1000
    const samples: Sample[] = records.filter((r) => inSession(ms(r.timestamp))).map((r) => {
      const cad = n(r.cadence)
      return {
        t: ms(r.timestamp),
        lat: n(r.position_lat), lng: n(r.position_long),
        ele: n(r.enhanced_altitude) ?? n(r.altitude),
        hr: n(r.heart_rate),
        // FIT running cadence is per leg (strides/min); fractional_cadence adds the half steps.
        cadence: cad != null ? Math.round((cad + (n(r.fractional_cadence) ?? 0)) * 2) : null,
        dist: n(r.distance),
        speed: n(r.enhanced_speed) ?? n(r.speed),
        temp: n(r.temperature),
      }
    })
    const sport = fitSport(ses.sport, ses.sub_sport)
    const avgCad = n(ses.avg_running_cadence) ?? n(ses.avg_cadence)
    const summary = summarise(samples, { sourceActivityId: sessions.length > 1 ? `${id}-${i}` : id, sport, name: null, tz }, {
      startMs: start,
      distanceM: n(ses.total_distance) ?? undefined,
      movingS: n(ses.total_timer_time) ?? undefined,
      elapsedS: elapsed ?? undefined,
      elevationGainM: n(ses.total_ascent),
      avgSpeedMs: n(ses.enhanced_avg_speed) ?? n(ses.avg_speed),
      maxSpeedMs: n(ses.enhanced_max_speed) ?? n(ses.max_speed),
      avgHr: n(ses.avg_heart_rate),
      maxHr: n(ses.max_heart_rate),
      avgCadenceSpm: avgCad != null && sport.includes('run') ? avgCad * 2 : undefined,
      calories: n(ses.total_calories),
    })
    if (!summary) return []
    const lapRows: Lap[] = laps.filter((l) => inSession(ms(l.start_time))).map((l) => ({
      distanceM: n(l.total_distance) ?? 0,
      durationS: n(l.total_timer_time) ?? n(l.total_elapsed_time) ?? 0,
      elevationGainM: n(l.total_ascent),
      avgSpeedMs: n(l.enhanced_avg_speed) ?? n(l.avg_speed) ?? (n(l.total_distance) && n(l.total_timer_time) ? l.total_distance / l.total_timer_time : null),
      avgHr: n(l.avg_heart_rate),
    }))
    return [{ summary, detail: { laps: lapRows, streams: buildStreams(samples) } }]
  })
}
