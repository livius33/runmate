// Synthetic activity files for the source tests: a steady run on a straight line (no real place, person or device),
// written as FIT (fit-file-parser's encoder), GPX 1.1 with Garmin's TrackPointExtension, and TCX. Same samples in all
// three, so the parsers can be compared with each other.
import { FitBaseType, FitEncoder } from 'fit-file-parser/encoder'
import { zipSync, strToU8 } from 'fflate'

export interface SyntheticRun {
  start: Date
  seconds: number          // one sample per second
  speedMs: number
  hr: number
  cadenceSpm: number
  sport?: 'running' | 'cycling' | 'trail'
}

export const RUN: SyntheticRun = { start: new Date('2026-05-10T06:00:00Z'), seconds: 1500, speedMs: 3.4, hr: 148, cadenceSpm: 172 }

const LAT0 = 47.0, LNG0 = 8.0
const M_PER_DEG_LAT = 111_195

export function samples(r: SyntheticRun) {
  return Array.from({ length: r.seconds + 1 }, (_, i) => {
    const dist = i * r.speedMs
    return {
      t: new Date(r.start.getTime() + i * 1000),
      lat: LAT0 + dist / M_PER_DEG_LAT,
      lng: LNG0,
      ele: 400 + 10 * Math.sin(i / 120),
      hr: r.hr + Math.round(6 * Math.sin(i / 300)),
      cadence: r.cadenceSpm,
      dist,
      speed: r.speedMs,
    }
  })
}

const semi = (deg: number) => Math.round(deg * (2 ** 31 / 180))
const f = (number: number, size: number, baseType: FitBaseType, value: number) => ({ number, size, baseType, value })

export function fitFile(r: SyntheticRun = RUN): Uint8Array {
  const s = samples(r)
  const ts = (d: Date) => FitEncoder.toFitTimestamp(d)
  const last = s[s.length - 1]
  const sport = r.sport === 'cycling' ? 2 : 1
  const subSport = r.sport === 'trail' ? 3 : 0
  const enc = new FitEncoder()
  enc.writeMessage(0, [f(0, 1, FitBaseType.Enum, 4), f(1, 2, FitBaseType.Uint16, 255), f(4, 4, FitBaseType.Uint32, ts(r.start))], 0)
  for (const p of s) {
    enc.writeMessage(20, [
      f(253, 4, FitBaseType.Uint32, ts(p.t)),
      f(0, 4, FitBaseType.Sint32, semi(p.lat)),
      f(1, 4, FitBaseType.Sint32, semi(p.lng)),
      f(2, 2, FitBaseType.Uint16, Math.round((p.ele + 500) * 5)),
      f(3, 1, FitBaseType.Uint8, p.hr),
      f(4, 1, FitBaseType.Uint8, Math.round(p.cadence / 2)),     // FIT running cadence is per leg
      f(5, 4, FitBaseType.Uint32, Math.round(p.dist * 100)),
      f(6, 2, FitBaseType.Uint16, Math.round(p.speed * 1000)),
    ], 1)
  }
  // Two laps: first and second half.
  const half = Math.floor(s.length / 2)
  for (const [a, b] of [[s[0], s[half]], [s[half], last]] as const) {
    enc.writeMessage(19, [
      f(253, 4, FitBaseType.Uint32, ts(b.t)),
      f(2, 4, FitBaseType.Uint32, ts(a.t)),
      f(7, 4, FitBaseType.Uint32, (b.t.getTime() - a.t.getTime())),
      f(8, 4, FitBaseType.Uint32, (b.t.getTime() - a.t.getTime())),
      f(9, 4, FitBaseType.Uint32, Math.round((b.dist - a.dist) * 100)),
      f(15, 1, FitBaseType.Uint8, r.hr),
    ], 2)
  }
  enc.writeMessage(18, [
    f(253, 4, FitBaseType.Uint32, ts(last.t)),
    f(2, 4, FitBaseType.Uint32, ts(r.start)),
    f(5, 1, FitBaseType.Enum, sport),
    f(6, 1, FitBaseType.Enum, subSport),
    f(7, 4, FitBaseType.Uint32, r.seconds * 1000),
    f(8, 4, FitBaseType.Uint32, r.seconds * 1000),
    f(9, 4, FitBaseType.Uint32, Math.round(last.dist * 100)),
    f(14, 2, FitBaseType.Uint16, Math.round(r.speedMs * 1000)),
    f(16, 1, FitBaseType.Uint8, r.hr),
    f(17, 1, FitBaseType.Uint8, r.hr + 6),
    f(11, 2, FitBaseType.Uint16, 350),
  ], 3)
  // Recorded two hours east of UTC: local_timestamp - timestamp = 7200 s.
  enc.writeMessage(34, [f(253, 4, FitBaseType.Uint32, ts(last.t)), f(5, 4, FitBaseType.Uint32, ts(last.t) + 7200), f(1, 2, FitBaseType.Uint16, 1)], 4)
  return enc.close()
}

export function gpxFile(r: SyntheticRun = RUN, name = 'Morgenlauf'): string {
  const pts = samples(r).map((p) => `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><ele>${p.ele.toFixed(1)}</ele><time>${p.t.toISOString()}</time>` +
    `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr><gpxtpx:cad>${p.cadence / 2}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="runmate-tests" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<metadata><time>${r.start.toISOString()}</time></metadata>
<trk><name>${name}</name><type>${r.sport === 'cycling' ? 'cycling' : 'running'}</type><trkseg>
${pts.join('\n')}
</trkseg></trk></gpx>`
}

export function tcxFile(r: SyntheticRun = RUN): string {
  const s = samples(r)
  const last = s[s.length - 1]
  const pts = s.map((p) => `<Trackpoint><Time>${p.t.toISOString()}</Time><Position><LatitudeDegrees>${p.lat.toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${p.lng.toFixed(7)}</LongitudeDegrees></Position>` +
    `<AltitudeMeters>${p.ele.toFixed(1)}</AltitudeMeters><DistanceMeters>${p.dist.toFixed(1)}</DistanceMeters><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm>` +
    `<Extensions><ns3:TPX><ns3:Speed>${p.speed}</ns3:Speed><ns3:RunCadence>${p.cadence / 2}</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
<Activities><Activity Sport="${r.sport === 'cycling' ? 'Biking' : 'Running'}"><Id>${r.start.toISOString()}</Id>
<Lap StartTime="${r.start.toISOString()}"><TotalTimeSeconds>${r.seconds}</TotalTimeSeconds><DistanceMeters>${last.dist.toFixed(1)}</DistanceMeters>
<Calories>350</Calories><AverageHeartRateBpm><Value>${r.hr}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${r.hr + 6}</Value></MaximumHeartRateBpm>
<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>
${pts.join('\n')}
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
}

// A Garmin data export in miniature: the activity files sit in a nested ZIP under DI_CONNECT, next to JSON that the
// import ignores.
export function garminExportZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const inner = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])))
  return zipSync({
    'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': inner,
    'DI_CONNECT/DI-Connect-Fitness/runner_0_summarizedActivities.json': strToU8('[]'),
  })
}
