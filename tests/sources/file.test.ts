// AC-8 (Phase 3): .FIT, .GPX, .TCX and a Garmin export ZIP (synthetic) parse into the same run — totals, local time,
// laps, aligned and downsampled streams that the run metrics accept; limits and bad files give German errors.
import { describe, expect, it } from 'vitest'
import { gzipSync, strToU8, zipSync } from 'fflate'
import { fileSource, MAX_FILE_BYTES } from '@/lib/sources/file'
import { batches } from '@/lib/sources/file/browser'
import { downsampleIndex, elevationGain, localWallTime } from '@/lib/sources/file/streams'
import { gpxSport } from '@/lib/sources/file/xml'
import { fitSport } from '@/lib/sources/file/fit'
import { computeRunMetrics, type StreamSet } from '@/lib/analytics/run-metrics'
import type { ParsedActivity } from '@/lib/sources/types'
import { fitFile, garminExportZip, gpxFile, RUN, tcxFile } from './fixtures'

const parse = (name: string, b: Uint8Array | string) => fileSource.parseFile(name, typeof b === 'string' ? strToU8(b) : b)
const KM = (RUN.seconds * RUN.speedMs) / 1000   // 5.1 km

function asStreamSet(p: ParsedActivity): StreamSet {
  const s = p.detail.streams!
  const nulls = s.time!.map(() => null)
  return { time: s.time!, distance: s.distance!, moving: s.moving ?? nulls, hr: s.heartrate ?? nulls, altitude: s.altitude ?? nulls, cadence: s.cadence ?? nulls }
}

describe('Datei-Parser', () => {
  it.each([
    ['run.fit', () => fitFile(), '2026-05-10T08:00:00'],     // FIT: the watch's own offset (+2 h, local_timestamp)
    ['run.gpx', () => gpxFile(), '2026-05-10T08:00:00'],     // GPX/TCX: the profile's time zone (Europe/Berlin, CEST)
    ['run.tcx', () => tcxFile(), '2026-05-10T08:00:00'],
  ])('%s → ein Lauf mit Summen, Ortszeit und Streams', async (name, make, local) => {
    const [a, ...rest] = await parse(name, make())
    expect(rest).toEqual([])
    const s = a.summary
    expect(s.sport).toBe('running')
    expect(s.startUtc).toBe('2026-05-10T06:00:00Z')
    expect(s.startLocal).toBe(local)
    expect(s.distanceM / 1000).toBeCloseTo(KM, 1)
    expect(s.elapsedS).toBe(RUN.seconds)
    expect(s.movingS).toBeGreaterThanOrEqual(RUN.seconds - 10)
    expect(s.avgHr).toBeGreaterThanOrEqual(146)
    expect(s.avgHr).toBeLessThanOrEqual(150)
    expect(s.avgSpeedMs).toBeCloseTo(RUN.speedMs, 1)
    expect(s.startLat).toBeCloseTo(47, 3)

    const st = a.detail.streams!
    expect(st.time!.length).toBe(1000)                     // 1 501 samples → 1 000
    expect(st.time![0]).toBe(Date.parse('2026-05-10T06:00:00Z'))
    expect(st.time!.at(-1)).toBe(Date.parse('2026-05-10T06:25:00Z'))
    expect(st.cadence!.every((c) => c === 172)).toBe(true) // per leg × 2
    expect(st.distance!.at(-1)! / 1000).toBeCloseTo(KM, 1)

    // The run metrics read the normalised shape: five full kilometres at ~4:54/km.
    const m = computeRunMetrics(asStreamSet(a), { date: '2026-05-10', distanceM: s.distanceM, durationS: s.elapsedS, averageHr: s.avgHr, averagePaceSPerKm: Math.round(1000 / s.avgSpeedMs!), type: 'Run', sportType: 'running' })
    expect(m.splits.filter((x) => x.distM >= 990).length).toBe(5)
    for (const sp of m.splits.slice(0, 5)) expect(Math.abs(sp.paceS - 1000 / RUN.speedMs)).toBeLessThan(6)
    expect(m.best['1k']).toBeGreaterThan(280)
  })

  it('FIT: Runden aus den Lap-Nachrichten, Sportart aus sport/sub_sport', async () => {
    const [a] = await parse('run.fit', fitFile())
    expect(a.detail.laps).toHaveLength(2)
    expect(a.detail.laps[0]).toMatchObject({ distanceM: 2550, durationS: 750, avgHr: 148 })
    expect((await parse('t.fit', fitFile({ ...RUN, sport: 'trail' })))[0].summary.sport).toBe('trail_running')
    expect((await parse('c.fit', fitFile({ ...RUN, sport: 'cycling' })))[0].summary.sport).toBe('cycling')
    expect(fitSport('running', 'treadmill')).toBe('treadmill_running')
    expect(fitSport('training', 'strength_training')).toBe('strength_training')
    expect(fitSport('swimming', 'open_water')).toBe('open_water_swimming')
  })

  it('GPX: Name und Typ aus dem Track, ohne Typ ein Lauf', async () => {
    const [a] = await parse('run.gpx', gpxFile(RUN, 'Abendrunde'))
    expect(a.summary.name).toBe('Abendrunde')
    expect(a.detail.laps).toEqual([])
    expect(gpxSport(null)).toBe('running')
    expect(gpxSport('Trail Running')).toBe('trail_running')
    expect(gpxSport('Radfahren')).toBe('cycling')
    expect(gpxSport('hiking')).toBe('hiking')
  })

  it('gleiche Datei → gleiche Quell-ID; andere Datei → andere', async () => {
    const [a] = await parse('a.fit', fitFile())
    const [b] = await parse('kopie.fit', fitFile())
    const [c] = await parse('c.fit', fitFile({ ...RUN, hr: 150 }))
    expect(a.summary.sourceActivityId).toBe(b.summary.sourceActivityId)
    expect(c.summary.sourceActivityId).not.toBe(a.summary.sourceActivityId)
  })

  it('Garmin-Export-ZIP: Dateien aus dem verschachtelten ZIP, Rest ignoriert; .gz wie gesendet', async () => {
    const zip = garminExportZip({ 'x/one.fit': fitFile(), 'two.gpx': gpxFile({ ...RUN, start: new Date('2026-05-11T06:00:00Z') }), 'three.tcx': tcxFile({ ...RUN, start: new Date('2026-05-12T06:00:00Z') }), 'notes.txt': 'ignored' })
    const all = await parse('export.zip', zip)
    expect(all.map((a) => a.summary.startUtc).sort()).toEqual(['2026-05-10T06:00:00Z', '2026-05-11T06:00:00Z', '2026-05-12T06:00:00Z'])
    const [gz] = await parse('one.fit.gz', gzipSync(fitFile()))
    expect(gz.summary.distanceM / 1000).toBeCloseTo(KM, 1)
  })

  it('Fehler auf Deutsch: unbekannter Typ, kaputtes XML, zu groß, gz-Bombe', async () => {
    await expect(parse('notes.txt', 'hallo')).rejects.toThrow(/nicht unterstützt/)
    await expect(parse('bad.gpx', '<gpx><trk>')).rejects.toThrow(/bad\.gpx/)
    await expect(parse('x.tcx', '<foo/>')).rejects.toThrow(/Keine TCX-Datei/)
    await expect(parse('big.fit', new Uint8Array(MAX_FILE_BYTES + 1))).rejects.toThrow(/zu groß/)
    // 30 MB of zeros gzip to ~30 kB; inflating stops once more than one file's worth has come out.
    await expect(parse('bomb.gpx.gz', gzipSync(new Uint8Array(30 * 1024 * 1024)))).rejects.toThrow(/zu groß/)
    await expect(parse('broken.zip', strToU8('PK nonsense'))).rejects.toThrow(/ZIP/)
    expect(await parse('empty.zip', zipSync({ 'readme.txt': strToU8('x') }))).toEqual([])
  })

  // 08-02 follow-up: an upload cut off in transit ends in compressed data, and those last four bytes read as the
  // uncompressed size said "over 20 MB" nearly every time: the report read "Datei zu groß" for a file of 40 kB.
  it('abgeschnittene .gz: beschädigt oder unvollständig, nicht „zu groß“', async () => {
    const whole = gzipSync(strToU8(gpxFile({ ...RUN, seconds: 9000 })))
    expect(whole.length).toBeGreaterThan(3 * 16 * 1024)        // several slices of the inflater
    expect((await parse('lang.gpx.gz', whole))[0].summary.movingS).toBeCloseTo(9000, -1)
    // Cut in the trailer, just before it, in the middle, in the header; and a file that is no gzip at all.
    for (const keep of [whole.length - 1, whole.length - 5, whole.length - 9, whole.length - 500, whole.length >> 1, 2000, 30, 12, 3]) {
      const err = await parse('pfad/lauf.gpx.gz', whole.slice(0, keep)).then(() => null, (e: Error) => e.message)
      expect(err, `${keep} of ${whole.length} bytes`).toBe('lauf.gpx.gz: Datei ist beschädigt oder unvollständig.')
    }
    await expect(parse('text.gpx.gz', gpxFile())).rejects.toThrow('text.gpx.gz: Datei ist beschädigt oder unvollständig.')
    // A stored size that is wrong in the other direction (smaller than the content) no longer cuts the file silently.
    const short = whole.slice(); short.set([10, 0, 0, 0], short.length - 4)
    await expect(parse('kurz.gpx.gz', short)).rejects.toThrow(/beschädigt oder unvollständig/)
    // In a ZIP the damaged or oversized entry is skipped, the rest is imported.
    const zip = zipSync({ 'ok.fit': fitFile(), 'cut.gpx.gz': whole.slice(0, whole.length >> 1), 'bomb.gpx.gz': gzipSync(new Uint8Array(30 * 1024 * 1024)) }, { level: 0 })
    expect(await parse('export.zip', zip)).toHaveLength(1)
  })

  // 11 × 20 MB of zeros pack to ~230 kB: every entry is within the per-file limit, together they took 220 MB of memory
  // (60 entries from a 1.2 MB upload: 1.2 GB). One upload may unpack to MAX_UNPACKED_BYTES in total, at any depth.
  it('ZIP-Bombe: viele erlaubte Dateien, gepackt in gz oder in einem inneren ZIP', async () => {
    const zeros = new Uint8Array(MAX_FILE_BYTES)
    const many = (name: (i: number) => string, b: Uint8Array, level: 0 | 9) => zipSync(Object.fromEntries(Array.from({ length: 11 }, (_, i) => [name(i), b])), { level })
    const plain = many((i) => `a${i}.fit`, zeros, 9)
    expect(plain.length).toBeLessThan(1024 * 1024)
    await expect(parse('bomb.zip', plain)).rejects.toThrow(/zu groß/)
    await expect(parse('gz.zip', many((i) => `a${i}.fit.gz`, gzipSync(zeros, { level: 9 }), 0))).rejects.toThrow(/zu groß/)
    await expect(parse('nested.zip', zipSync({ 'inner.zip': plain }))).rejects.toThrow(/zu groß/)
  }, 30_000)
})

describe('Hilfsfunktionen', () => {
  it('Downsampling behält Anfang und Ende', () => {
    expect(downsampleIndex(5, 10)).toEqual([0, 1, 2, 3, 4])
    const idx = downsampleIndex(1501, 1000)
    expect(idx).toHaveLength(1000)
    expect([idx[0], idx.at(-1)]).toEqual([0, 1500])
    expect(new Set(idx).size).toBe(1000)
  })

  it('Höhenmeter mit 2-m-Totband, Ortszeit je Zone oder Offset', () => {
    expect(elevationGain([100, 101, 100, 101, 100])).toBe(0)
    expect(elevationGain([100, 105, 103, 110])).toBe(10)
    expect(localWallTime(Date.parse('2026-01-10T06:00:00Z'), { zone: 'Europe/Berlin' })).toBe('2026-01-10T07:00:00')
    expect(localWallTime(Date.parse('2026-01-10T06:00:00Z'), { offsetS: -5 * 3600 })).toBe('2026-01-10T01:00:00')
  })

  it('Upload-Pakete bleiben unter beiden Grenzen', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ name: String(i), bytes: new Uint8Array(i % 2 ? 1_500_000 : 10) }))
    const parts = batches(items, 4 * 1024 * 1024, 25)
    expect(parts.flat()).toHaveLength(60)
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(25)
      expect(p.reduce((n, x) => n + x.bytes.length, 0)).toBeLessThanOrEqual(4 * 1024 * 1024)
    }
  })
})
