// .GPX and .TCX via fast-xml-parser (MIT). Namespaces are dropped (gpxtpx:hr → hr), entities are not expanded.
import { XMLParser } from 'fast-xml-parser'
import type { Lap, ParsedActivity } from '@/lib/sources/types'
import { SourceError } from '@/lib/sources/types'
import { buildStreams, summarise, type Sample } from './streams'

type Node = Record<string, any>

const ARRAYS = new Set(['trk', 'trkseg', 'trkpt', 'Activity', 'Lap', 'Track', 'Trackpoint'])
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  processEntities: false,
  isArray: (name) => ARRAYS.has(name),
})

const num = (v: unknown): number | null => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(x) ? x : null
}
const text = (v: unknown): string | null => (v == null ? null : typeof v === 'object' ? (v as Node)['#text'] ?? null : String(v))
const ms = (v: unknown) => { const t = Date.parse(String(text(v) ?? '')); return Number.isFinite(t) ? t : NaN }

function parseXml(xml: string): Node {
  try { return parser.parse(xml) as Node } catch { throw new SourceError('invalid', 'Die Datei ist kein gültiges XML.') }
}

// GPX <type> (free text: Garmin and Strava write 'running', 'cycling', …) → sport key. No type → a run.
export function gpxSport(type: string | null): string {
  const t = (type ?? '').toLowerCase().trim()
  if (!t || /^(run|running|laufen|9)$/.test(t)) return 'running'
  if (/trail/.test(t)) return 'trail_running'
  if (/treadmill|laufband/.test(t)) return 'treadmill_running'
  if (/run|lauf/.test(t)) return 'running'
  if (/cycl|bik|ride|rad/.test(t)) return 'cycling'
  if (/swim|schwimm/.test(t)) return 'lap_swimming'
  return t.replace(/\s+/g, '_')
}

export function parseGpx(xml: string, id: string, zone: string): ParsedActivity[] {
  const gpx = parseXml(xml).gpx
  if (!gpx) throw new SourceError('invalid', 'Keine GPX-Datei (kein <gpx>-Element).')
  return (gpx.trk ?? []).flatMap((trk: Node, i: number): ParsedActivity[] => {
    const samples: Sample[] = (trk.trkseg ?? []).flatMap((seg: Node) => seg.trkpt ?? []).map((p: Node) => {
      const ext = p.extensions?.TrackPointExtension ?? p.extensions ?? {}
      const cad = num(ext.cad)
      return {
        t: ms(p.time),
        lat: num(p['@_lat']), lng: num(p['@_lon']),
        ele: num(p.ele),
        hr: num(ext.hr),
        cadence: cad != null ? Math.round(cad * 2) : null,   // per leg, like FIT
        temp: num(ext.atemp),
      }
    }).filter((p: Sample) => Number.isFinite(p.t))
    if (samples.length < 2) return []
    const summary = summarise(samples, { sourceActivityId: (gpx.trk.length > 1 ? `${id}-${i}` : id), sport: gpxSport(text(trk.type)), name: text(trk.name), tz: { zone } })
    return summary ? [{ summary, detail: { laps: [], streams: buildStreams(samples) } }] : []
  })
}

// TCX Activity@Sport is Running | Biking | Other.
const tcxSport = (s: unknown) => (s === 'Biking' ? 'cycling' : s === 'Running' ? 'running' : 'other')

export function parseTcx(xml: string, id: string, zone: string): ParsedActivity[] {
  const db = parseXml(xml).TrainingCenterDatabase
  if (!db) throw new SourceError('invalid', 'Keine TCX-Datei (kein <TrainingCenterDatabase>-Element).')
  const activities: Node[] = db.Activities?.Activity ?? []
  return activities.flatMap((a, i): ParsedActivity[] => {
    const laps: Node[] = a.Lap ?? []
    const samples: Sample[] = laps.flatMap((l) => (l.Track ?? []).flatMap((t: Node) => t.Trackpoint ?? [])).map((p: Node) => {
      const tpx = p.Extensions?.TPX ?? {}
      const runCad = num(tpx.RunCadence)
      return {
        t: ms(p.Time),
        lat: num(p.Position?.LatitudeDegrees), lng: num(p.Position?.LongitudeDegrees),
        ele: num(p.AltitudeMeters),
        hr: num(p.HeartRateBpm?.Value),
        cadence: runCad != null ? Math.round(runCad * 2) : null,
        dist: num(p.DistanceMeters),
        speed: num(tpx.Speed),
      }
    }).filter((p) => Number.isFinite(p.t))
    const sum = (k: string) => laps.reduce((acc, l) => acc + (num(l[k]) ?? 0), 0)
    const hrs = laps.map((l) => [num(l.AverageHeartRateBpm?.Value), num(l.TotalTimeSeconds)] as const).filter(([h, t]) => h != null && t)
    const lapRows: Lap[] = laps.map((l) => ({
      distanceM: num(l.DistanceMeters) ?? 0,
      durationS: num(l.TotalTimeSeconds) ?? 0,
      elevationGainM: null,
      avgSpeedMs: num(l.DistanceMeters) && num(l.TotalTimeSeconds) ? num(l.DistanceMeters)! / num(l.TotalTimeSeconds)! : null,
      avgHr: num(l.AverageHeartRateBpm?.Value),
    }))
    const startMs = ms(laps[0]?.['@_StartTime'] ?? a.Id)
    const maxHr = laps.map((l) => num(l.MaximumHeartRateBpm?.Value)).filter((v): v is number => v != null)
    const summary = summarise(samples, { sourceActivityId: activities.length > 1 ? `${id}-${i}` : id, sport: tcxSport(a['@_Sport']), name: text(a.Notes), tz: { zone } }, {
      startMs: Number.isFinite(startMs) ? startMs : undefined,
      distanceM: sum('DistanceMeters') || undefined,
      movingS: sum('TotalTimeSeconds') || undefined,
      avgHr: hrs.length ? Math.round(hrs.reduce((acc, [h, t]) => acc + h! * t!, 0) / hrs.reduce((acc, [, t]) => acc + t!, 0)) : undefined,
      maxHr: maxHr.length ? Math.max(...maxHr) : undefined,
      calories: sum('Calories') || undefined,
    })
    return summary ? [{ summary, detail: { laps: lapRows, streams: buildStreams(samples) } }] : []
  })
}
