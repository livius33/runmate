// AC-2/AC-8/AC-9 (Phase 3): the duplicate rule (start ±2 min, distance ±3 %, any source), the same file twice, the
// same run from another source, and per-user isolation of imports — against the SQL the ingest code sends.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDuplicate } from '@/lib/sources/dedupe'
import { runAsUser } from '@/lib/server/scope'
import { useFakeDb, type Query } from '../scope/fake-db'
import { fitFile, gpxFile, RUN } from './fixtures'
import { strToU8 } from 'fflate'

const metrics = vi.hoisted(() => ({ storeRunMetrics: vi.fn(async (_id: string) => null) }))
vi.mock('@/lib/analytics/store-metrics', () => metrics)
vi.mock('@/lib/plan/load', () => ({ loadPlan: async () => [] }))
const { importFiles } = await import('@/lib/sources/file/import')
const { upsertSummary } = await import('@/lib/sources/ingest')

const asUser = <T>(id: string, fn: () => Promise<T>) => runAsUser(id, fn, { profile: null })
const T = Date.parse('2026-05-10T06:00:00Z') / 1000

describe('Dublettenregel', () => {
  const k = (dt: number, m: number) => ({ startedAt: T + dt, startLocal: null, distanceM: m })
  it('±2 Minuten und ±3 % → gleiche Aktivität', () => {
    expect(isDuplicate(k(0, 10000), k(120, 10300))).toBe(true)
    expect(isDuplicate(k(0, 10000), k(-120, 9709))).toBe(true)
    expect(isDuplicate(k(0, 10000), k(121, 10000))).toBe(false)
    expect(isDuplicate(k(0, 10000), k(0, 10400))).toBe(false)
    expect(isDuplicate(k(0, 0), k(30, 0))).toBe(true)          // two strength sessions at the same time
  })
  it('ohne UTC-Start: Ortszeit', () => {
    const a = { startedAt: null, startLocal: '2026-05-10T08:00:00', distanceM: 5000 }
    expect(isDuplicate(a, { startedAt: T, startLocal: '2026-05-10T08:01:30', distanceM: 5050 })).toBe(true)
    expect(isDuplicate(a, { startedAt: T, startLocal: '2026-05-10T08:03:00', distanceM: 5000 })).toBe(false)
    expect(isDuplicate(a, { startedAt: null, startLocal: null, distanceM: 5000 })).toBe(false)
  })
})

// An in-memory activities table per user, answering the queries of lib/sources/ingest.ts.
interface Act {
  id: string; source: string; sourceActivityId: string | null; startedAt: number | null; date: string; startTime: string | null; distanceM: number; type: string
  hasDetailedData?: boolean; hasStreams?: boolean; laps?: boolean; averageHr?: number | null; perceivedExertion?: number | null; runTypeOverride?: string | null
  channels?: number; hrStream?: boolean
}
const STREAM_COLS = ['time_json', 'distance_json', 'moving_json', 'speed_json', 'altitude_json', 'heartrate_json', 'cadence_json', 'temperature_json', 'latlng_json']
// "col" = $n pairs of an update's set clause → { col: value }.
const setOf = (q: Query) => Object.fromEntries([...q.sql.slice(0, q.sql.indexOf(' where ')).matchAll(/"(\w+)" = \$(\d+)/g)].map(([, c, n]) => [c, q.params[Number(n) - 1]]))
// The user a query runs for: the first value of an insert, else the parameter compared with "user_id".
const userOf = (q: Query) => {
  if (/^insert/.test(q.sql)) return String(q.params[0])
  const m = q.sql.match(/"user_id" = \$(\d+)/)
  return m ? String(q.params[Number(m[1]) - 1]) : null
}

// `before` sees every query first and may throw (a database error at that point).
function fakeActivities(tables: Record<string, Act[]>, before: (q: Query) => void = () => {}) {
  const fake = useFakeDb((q: Query) => {
    before(q)
    const user = userOf(q)
    if (!user) return []
    const rows = tables[user] ??= []
    if (/^insert into "activities"/.test(q.sql)) {
      const [, colList, valList] = q.sql.match(/\(([^)]+)\) values \(([^)]+)\)/)!
      const cols = colList.split(', ').map((c) => c.replace(/"/g, ''))
      const vals = valList.split(', ').map((t) => (t.startsWith('$') ? q.params[Number(t.slice(1)) - 1] : undefined))
      const v = Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
      rows.push({ id: String(v.id), source: String(v.source), sourceActivityId: v.source_activity_id as string, startedAt: v.started_at as number, date: String(v.date), startTime: v.start_time as string, distanceM: Number(v.distance_m), type: String(v.type) })
      return []
    }
    if (/^select "id", "type", "has_detailed_data" from "activities"/.test(q.sql)) {   // by (source, source id)
      const [, source, sid] = q.params                         // user, source, source id
      return rows.filter((r) => r.source === source && r.sourceActivityId === sid).map((r) => [r.id, r.type, !!r.hasDetailedData])
    }
    if (/^select "id", "started_at", "date", "start_time", "distance_m" from "activities"/.test(q.sql)) {
      return rows.map((r) => [r.id, r.startedAt, r.date, r.startTime, r.distanceM])
    }
    if (/^select "type" from "activities"/.test(q.sql)) return rows.filter((r) => r.id === q.params[1]).map((r) => [r.type])
    const byId = (id: unknown) => rows.filter((r) => r.id === id)
    if (/^select "source", "has_detailed_data", "has_streams"/.test(q.sql)) {   // richness of a stored duplicate
      return byId(q.params[1]).map((r) => [r.source, !!r.hasDetailedData, !!r.hasStreams, !!r.laps, r.averageHr ?? null])
    }
    if (/^select \(.*from "activity_streams"/.test(q.sql)) return byId(q.params[1]).filter((r) => r.hasStreams).map((r) => [r.channels ?? 0, !!r.hrStream])
    if (/^delete from "activity_streams"/.test(q.sql)) { for (const r of byId(q.params[1])) Object.assign(r, { channels: 0, hrStream: false }); return [] }
    if (/^insert into "activity_streams"/.test(q.sql)) {
      const [, colList, valList] = q.sql.match(/\(([^)]+)\) values \(([^)]+)\)/)!
      const cols = colList.split(', ').map((c) => c.replace(/"/g, ''))
      const vals = valList.split(', ').map((t) => (t.startsWith('$') ? q.params[Number(t.slice(1)) - 1] : null))
      const v = Object.fromEntries(cols.map((c, i) => [c, vals[i]]))
      for (const r of byId(v.activity_id)) Object.assign(r, { channels: STREAM_COLS.filter((c) => v[c] != null).length, hrStream: v.heartrate_json != null })
      return []
    }
    if (/^update "activities"/.test(q.sql)) {
      const set = setOf(q)
      const id = q.params[q.params.length - 1]
      const map: Record<string, keyof Act> = { source: 'source', source_activity_id: 'sourceActivityId', average_hr: 'averageHr', has_detailed_data: 'hasDetailedData', has_streams: 'hasStreams', perceived_exertion: 'perceivedExertion', run_type_override: 'runTypeOverride' }
      for (const r of byId(id)) {
        for (const [col, key] of Object.entries(map)) if (col in set) (r as any)[key] = set[col]
        if ('splits_metric_json' in set) r.laps = set.splits_metric_json != null
      }
      return []
    }
    return []
  })
  return fake
}

let fake: ReturnType<typeof useFakeDb>
afterEach(() => fake?.restore())

describe('Import in die Datenbank', () => {
  it('gleiche Datei zweimal → beim zweiten Mal übersprungen', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const first = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    const again = await asUser('user-a', () => importFiles([{ name: 'kopie.fit', bytes: fitFile() }]))
    expect(first).toMatchObject({ files: 1, inserted: 1, duplicates: 0, errors: [] })
    expect(again).toMatchObject({ files: 1, inserted: 0, duplicates: 1 })
    expect(tables['user-a']).toHaveLength(1)
    expect(tables['user-a'][0]).toMatchObject({ source: 'file', type: 'Run', startedAt: T, date: '2026-05-10', startTime: '08:00:00' })
    // Streams were written for the new run only.
    expect(fake.log.filter((q) => /^insert into "activity_streams"/.test(q.sql))).toHaveLength(1)
  })

  it('derselbe Lauf aus einer anderen Quelle (GPX nach Garmin) → übersprungen', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [{ id: 'g1', source: 'garmin', sourceActivityId: '1001', startedAt: T + 60, date: '2026-05-10', startTime: '08:01:00', distanceM: 5150, type: 'Run', averageHr: 150 }] }
    fake = fakeActivities(tables)
    const r = await asUser('user-a', () => importFiles([{ name: 'run.gpx', bytes: strToU8(gpxFile()) }, { name: 'other.gpx', bytes: strToU8(gpxFile({ ...RUN, start: new Date('2026-05-11T06:00:00Z') })) }]))
    expect(r).toMatchObject({ inserted: 1, duplicates: 1 })
    expect(tables['user-a'].map((a) => a.source).sort()).toEqual(['file', 'garmin'])
  })

  it('Sportarten außerhalb von Runmate werden gezählt, nicht gespeichert; kaputte Dateien mit Grund', async () => {
    fake = fakeActivities({})
    const walk = gpxFile(RUN).replace('<type>running</type>', '<type>walking</type>')
    const r = await asUser('user-a', () => importFiles([{ name: 'walk.gpx', bytes: strToU8(walk) }, { name: 'x.doc', bytes: strToU8('?') }]))
    expect(r).toMatchObject({ inserted: 0, skipped: 1 })
    expect(r.errors).toEqual([{ name: 'x.doc', message: expect.stringMatching(/nicht unterstützt/) }])
  })

  it('zwei Nutzer importieren dieselbe Datei gleichzeitig: jeder nur in seinen Daten', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [{ id: 'a1', source: 'garmin', sourceActivityId: '7', startedAt: T, date: '2026-05-10', startTime: '08:00:00', distanceM: 5100, type: 'Run', averageHr: 150 }] }
    fake = fakeActivities(tables)
    const [a, b] = await Promise.all([
      asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }])),
      asUser('user-b', () => importFiles([{ name: 'run.fit', bytes: fitFile() }])),
    ])
    expect(a).toMatchObject({ inserted: 0, duplicates: 1 })     // user-a has this run from Garmin already
    expect(b).toMatchObject({ inserted: 1, duplicates: 0 })     // user-b does not: never sees user-a's rows
    expect(tables['user-b']).toHaveLength(1)
    expect(tables['user-a']).toHaveLength(1)
    // Every query on activities/streams is filtered by (or inserts) the user it ran for.
    const touched = fake.log.filter((q) => /"activit(ies|y_streams)"/.test(q.sql))
    expect(touched.length).toBeGreaterThan(6)
    for (const q of touched) {
      expect(q.sql).toMatch(/^insert into "activit(ies|y_streams)" \("user_id"|"activit(ies|y_streams)"\."user_id" = \$\d+/)
      expect(['user-a', 'user-b']).toContain(userOf(q))
    }
  })

  it('gleiche Quell-ID erneut synchronisiert → aktualisiert, keine Dublette', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const summary = { sourceActivityId: '42', startUtc: '2026-05-10T06:00:00Z', startLocal: '2026-05-10T08:00:00', sport: 'running', name: null, distanceM: 5000, movingS: 1500, elapsedS: 1510, elevationGainM: null, avgSpeedMs: null, maxSpeedMs: null, avgHr: null, maxHr: null, avgCadenceSpm: null, calories: null, startLat: null, startLng: null }
    expect((await asUser('user-a', () => upsertSummary('garmin', summary))).result).toBe('inserted')
    expect((await asUser('user-a', () => upsertSummary('garmin', { ...summary, distanceM: 5010 }))).result).toBe('updated')
    expect(tables['user-a']).toHaveLength(1)
    const update = fake.log.find((q) => /^update "activities"/.test(q.sql))!
    // Detail fields the sync does not own are left alone.
    expect(update.sql).not.toMatch(/splits_metric_json|has_streams|metrics_json|run_type_override|notes/)
  })
})

// Phase 2/3 follow-up: a duplicate from another source replaces the stored one when it is richer; otherwise skipped.
describe('Dubletten: der reichere Eintrag gewinnt', () => {
  const summary = { sourceActivityId: 'x', startUtc: '2026-05-10T06:00:00Z', startLocal: '2026-05-10T08:00:00', sport: 'running', name: 'Lauf', distanceM: 5000, movingS: 1500, elapsedS: 1510, elevationGainM: null, avgSpeedMs: null, maxSpeedMs: null, avgHr: 150, maxHr: 170, avgCadenceSpm: null, calories: null, startLat: null, startLng: null }
  const appleRun = (over: Partial<Act> = {}): Act => ({ id: 'a1', source: 'apple-health', sourceActivityId: 'apple-1', startedAt: T + 30, date: '2026-05-10', startTime: '08:00:30', distanceM: 5050, type: 'Run', averageHr: 148, perceivedExertion: 7, runTypeOverride: 'long', ...over })
  const streams = { time: [0, 1000], distance: [0, 5], moving: [0, 1], speed: [3, 3], altitude: [10, 11], heartrate: [140, 150], cadence: [170, 172], temperature: null, latlng: [[53.5, 10], [53.5, 10.001]] as [number, number][] }
  afterEach(() => metrics.storeRunMetrics.mockClear())

  it('Apple-Lauf ohne Verlauf, dann Garmin mit Verlauf → Garmin ersetzt, RPE und Lauftyp bleiben', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [appleRun()] }
    fake = fakeActivities(tables)
    const u = await asUser('user-a', () => upsertSummary('garmin', { ...summary, sourceActivityId: 'g-9' }))
    expect(u).toEqual({ result: 'replaced', id: 'a1' })
    expect(tables['user-a']).toHaveLength(1)
    expect(tables['user-a'][0]).toMatchObject({ id: 'a1', source: 'garmin', sourceActivityId: 'g-9', averageHr: 150, hasDetailedData: false, perceivedExertion: 7, runTypeOverride: 'long' })
    const update = fake.log.find((q) => /^update "activities"/.test(q.sql))!
    expect(update.sql).not.toMatch(/perceived_exertion|run_type_override|"notes"|"description"/)
    expect(metrics.storeRunMetrics).toHaveBeenCalledWith('a1')     // metrics follow the new summary
    // The next sync's enrichment loads Garmin's streams into the same row.
    const { storeDetail } = await import('@/lib/sources/ingest')
    await asUser('user-a', () => storeDetail('a1', { laps: [], streams }))
    expect(tables['user-a'][0]).toMatchObject({ hasStreams: true, channels: 8, perceivedExertion: 7 })
  })

  it('eine Datei mit Verlauf ersetzt einen Apple-Lauf ohne Verlauf', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [appleRun({ startedAt: T + 60, startTime: '08:01:00', distanceM: 5150 })] }
    fake = fakeActivities(tables)
    const r = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(r).toMatchObject({ inserted: 0, replaced: 1, duplicates: 0 })
    expect(tables['user-a']).toHaveLength(1)
    expect(tables['user-a'][0]).toMatchObject({ id: 'a1', source: 'file', hasStreams: true, perceivedExertion: 7 })
  })

  it('Garmin zuerst, dann Apple → Apple übersprungen', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [{ ...appleRun(), id: 'g1', source: 'garmin', sourceActivityId: 'g-1', hasDetailedData: true, hasStreams: true, channels: 8, hrStream: true, laps: true, averageHr: 150 }] }
    fake = fakeActivities(tables)
    const u = await asUser('user-a', () => upsertSummary('apple-health', { ...summary, sourceActivityId: 'apple-2' }))
    expect(u).toEqual({ result: 'duplicate', id: 'g1' })
    expect(tables['user-a'][0]).toMatchObject({ source: 'garmin', sourceActivityId: 'g-1' })
    expect(fake.log.some((q) => /^(update|delete)/.test(q.sql))).toBe(false)
  })

  it('Garmin zuerst, noch ohne Detaildaten, dann Apple mit Puls → übersprungen (die Details kommen noch)', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [{ ...appleRun(), id: 'g1', source: 'garmin', sourceActivityId: 'g-1', averageHr: null }] }
    fake = fakeActivities(tables)
    expect((await asUser('user-a', () => upsertSummary('apple-health', { ...summary, sourceActivityId: 'apple-2' }))).result).toBe('duplicate')
  })

  it('gleich reich → übersprungen (der erste bleibt)', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [appleRun()] }
    fake = fakeActivities(tables)
    // Another push source's summary with HR, like the stored Apple run: nothing to gain.
    expect((await asUser('user-a', () => upsertSummary('apple-health', { ...summary, sourceActivityId: 'apple-2' }))).result).toBe('duplicate')
    expect(tables['user-a'][0]).toMatchObject({ sourceActivityId: 'apple-1' })
    // The same file again into a file-imported run with the same streams.
    const { fileSource } = await import('@/lib/sources/file')
    const [{ detail }] = await fileSource.parseFile('run.fit', fitFile())
    const channels = Object.values(detail.streams!).filter((v) => (v as unknown[] | null)?.some((x) => x != null)).length
    const fileRow = { ...appleRun(), id: 'f1', source: 'file', sourceActivityId: 'other-hash', hasDetailedData: true, hasStreams: true, laps: detail.laps.length > 0, channels, hrStream: true }
    const t2: Record<string, Act[]> = { 'user-a': [fileRow] }
    fake.restore(); fake = fakeActivities(t2)
    const r = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(r).toMatchObject({ replaced: 0, duplicates: 1 })
  })
})

describe('Reichhaltigkeit (rein)', () => {
  it('Details vor Kanälen vor Puls; Gleichstand → nicht reicher', async () => {
    const { isRicher } = await import('@/lib/sources/dedupe')
    const r = (detail: boolean, channels: number | null, hr: boolean) => ({ detail, channels, hr })
    expect(isRicher(r(true, 0, false), r(false, 0, true))).toBe(true)
    expect(isRicher(r(true, 8, true), r(true, 5, true))).toBe(true)
    expect(isRicher(r(false, 0, true), r(false, 0, false))).toBe(true)
    expect(isRicher(r(false, 0, true), r(false, 0, true))).toBe(false)
    expect(isRicher(r(true, 0, true), r(true, 6, false))).toBe(false)
    // Detail still to be fetched (channels unknown): only detail and HR count.
    expect(isRicher(r(true, 8, false), r(true, null, true))).toBe(false)
    expect(isRicher(r(true, null, true), r(true, 8, false))).toBe(true)
  })
})

// 08-02 follow-up: the activity row is written before its detail data (streams, laps, run metrics), and there is no
// transaction across both database drivers. A failure in between must show in the report and heal on the next import.
describe('Detaildaten scheitern nach dem Einfügen', () => {
  afterEach(() => metrics.storeRunMetrics.mockClear())
  const failOnce = (pattern: RegExp) => {
    let failed = false
    return (q: Query) => { if (!failed && pattern.test(q.sql)) { failed = true; throw new Error('connection reset') } }
  }

  it('Verlauf lässt sich nicht speichern: der Bericht sagt, was da ist; dieselbe Datei erneut → vervollständigt, keine Dublette', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables, failOnce(/^insert into "activity_streams"/))
    const first = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    // The row is there (it counts for load and plan), its detail is not: both are said.
    expect(tables['user-a']).toHaveLength(1)
    expect(tables['user-a'][0]).not.toMatchObject({ hasDetailedData: true })
    expect(first).toMatchObject({ inserted: 1, duplicates: 0, repaired: 0 })
    expect(first.errors).toEqual([{ name: 'run.fit', message: expect.stringMatching(/^run\.fit: Aktivität vom 10\.05\.2026 gespeichert, aber ohne Detaildaten .*erneut importieren/) }])

    const again = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(again).toMatchObject({ inserted: 0, duplicates: 0, repaired: 1, errors: [] })
    expect(tables['user-a']).toHaveLength(1)
    expect(tables['user-a'][0]).toMatchObject({ hasDetailedData: true, hasStreams: true, laps: true })
    expect(metrics.storeRunMetrics).toHaveBeenCalledTimes(1)

    // Complete now: a third import is an ordinary duplicate.
    expect(await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))).toMatchObject({ inserted: 0, duplicates: 1, repaired: 0, errors: [] })
  })

  it('die Laufauswertung scheitert als letzter Schritt: nicht als vollständig markiert, der nächste Import holt sie nach', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    metrics.storeRunMetrics.mockRejectedValueOnce(new Error('connection reset'))
    const first = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(first).toMatchObject({ inserted: 1, repaired: 0 })
    expect(first.errors).toHaveLength(1)
    expect(tables['user-a'][0]).not.toMatchObject({ hasDetailedData: true })
    const again = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(again).toMatchObject({ inserted: 0, duplicates: 0, repaired: 1, errors: [] })
    expect(tables['user-a'][0]).toMatchObject({ hasDetailedData: true, hasStreams: true })
    expect(metrics.storeRunMetrics).toHaveBeenCalledTimes(2)
  })

  it('eine Datei ersetzt einen ärmeren Eintrag und die Details scheitern: ersetzt gezählt, beim nächsten Mal vervollständigt', async () => {
    const tables: Record<string, Act[]> = { 'user-a': [{ id: 'a1', source: 'apple-health', sourceActivityId: 'apple-1', startedAt: T + 60, date: '2026-05-10', startTime: '08:01:00', distanceM: 5150, type: 'Run', averageHr: 148, perceivedExertion: 7 }] }
    fake = fakeActivities(tables, failOnce(/^insert into "activity_streams"/))
    const first = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(first).toMatchObject({ inserted: 0, replaced: 1, repaired: 0 })
    expect(first.errors).toHaveLength(1)
    const again = await asUser('user-a', () => importFiles([{ name: 'run.fit', bytes: fitFile() }]))
    expect(again).toMatchObject({ replaced: 0, duplicates: 0, repaired: 1, errors: [] })
    expect(tables['user-a']).toEqual([expect.objectContaining({ id: 'a1', source: 'file', hasDetailedData: true, hasStreams: true, perceivedExertion: 7 })])
  })

  it('eine Radeinheit hat keine Detaildaten: erneut importiert bleibt sie eine Dublette', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const ride = () => fitFile({ ...RUN, sport: 'cycling' })
    expect(await asUser('user-a', () => importFiles([{ name: 'ride.fit', bytes: ride() }]))).toMatchObject({ inserted: 1, errors: [] })
    expect(await asUser('user-a', () => importFiles([{ name: 'ride.fit', bytes: ride() }]))).toMatchObject({ inserted: 0, duplicates: 1, repaired: 0, errors: [] })
  })
})

// 08-02 follow-up: a GPS glitch once became a stored run of 17,793 km. Impossible activities stop at the ingest, for
// every source; real ones (ultras, multi-day races, sprints) never do.
describe('Plausibilität beim Speichern', () => {
  const summary = { sourceActivityId: 'p', startUtc: '2026-05-10T06:00:00Z', startLocal: '2026-05-10T08:00:00', sport: 'running', name: null, distanceM: 10000, movingS: 3000, elapsedS: 3100, elevationGainM: null, avgSpeedMs: null, maxSpeedMs: null, avgHr: null, maxHr: null, avgCadenceSpm: null, calories: null, startLat: null, startLng: null }
  // One position on the other side of the world in the middle of a 5 km run.
  const glitch = () => {
    const lines = gpxFile().split('\n')
    const i = lines.findIndex((l, n) => n > 700 && l.startsWith('<trkpt'))
    lines[i] = lines[i].replace(/lat="[^"]+" lon="[^"]+"/, 'lat="-42.0000000" lon="-172.0000000"')
    return strToU8(lines.join('\n'))
  }

  it('echte Aktivitäten bleiben: Ultra, Mehrtageslauf, Sprint, Laufband, Kraft, Rad', async () => {
    const { implausible } = await import('@/lib/sources/ingest')
    const ok = (o: Partial<typeof summary>) => expect(implausible({ ...summary, ...o }), JSON.stringify(o)).toBeNull()
    ok({})
    ok({ sport: 'trail_running', distanceM: 160_934, movingS: 100_000, elapsedS: 30 * 3600 })      // 100 miles in 30 h
    ok({ distanceM: 1_045_000, movingS: 400_000, elapsedS: 6 * 86_400 })                            // a six-day race
    ok({ sport: 'track_running', distanceM: 100, movingS: 10, elapsedS: 10 })                       // a 100 m sprint
    ok({ sport: 'treadmill_running', distanceM: 0 })                                                // no foot pod
    ok({ sport: 'strength_training', distanceM: 0, movingS: 2400, elapsedS: 2400 })
    ok({ sport: 'cycling', distanceM: 300_000, movingS: 9 * 3600, elapsedS: 10 * 3600 })
    ok({ distanceM: 21_097, movingS: 60, elapsedS: 5400 })                                          // an odd moving time alone never rejects
  })

  it('unmögliche Werte: Distanz, Tempo, Dauer', async () => {
    const { implausible } = await import('@/lib/sources/ingest')
    const no = (o: Partial<typeof summary>) => implausible({ ...summary, ...o })?.check
    expect(no({ distanceM: 17_793_000, movingS: 3000, elapsedS: 3100 })).toBe('speed')
    expect(no({ distanceM: 17_793_000, movingS: 20 * 86_400, elapsedS: 20 * 86_400 })).toBe('distance')
    expect(no({ distanceM: 30_000, movingS: 1800, elapsedS: 1800 })).toBe('speed')                  // 60 km/h on foot
    expect(no({ distanceM: 5000, movingS: 0, elapsedS: 0 })).toBe('duration')
    expect(no({ distanceM: 5000, movingS: -1500, elapsedS: -1500 })).toBe('values')
    expect(no({ distanceM: -5000 })).toBe('values')
    expect(no({ distanceM: NaN })).toBe('values')
    expect(no({ distanceM: 0, movingS: 40 * 86_400, elapsedS: 40 * 86_400 })).toBe('duration')
    expect(no({ sport: 'cycling', distanceM: 17_793_000, movingS: 3600, elapsedS: 3600 })).toBe('speed')
  })

  it('Datei mit GPS-Sprung: nicht gespeichert, im Bericht mit Dateiname und Grund', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const r = await asUser('user-a', () => importFiles([{ name: 'sprung.gpx', bytes: glitch() }, { name: 'run.fit', bytes: fitFile({ ...RUN, start: new Date('2026-05-11T06:00:00Z') }) }]))
    expect(r).toMatchObject({ files: 2, inserted: 1, duplicates: 0 })
    expect(r.errors).toEqual([{ name: 'sprung.gpx', message: expect.stringMatching(/^sprung\.gpx: Aktivität vom 10\.05\.2026 nicht importiert – [\d.,]+ km in 0:25 h sind nicht möglich \(über 45 km\/h im Schnitt\)\.$/) }])
    expect(tables['user-a'].map((a) => a.date)).toEqual(['2026-05-11'])
    expect(fake.log.filter((q) => /^insert into "activity_streams"/.test(q.sql))).toHaveLength(1)
  })

  it('Sync einer Quelle: übersprungen und protokolliert, der Rest läuft weiter', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const { syncSource, syncHistoryPage } = await import('@/lib/sources/sync')
    const items = [{ ...summary, sourceActivityId: 'bad', distanceM: 17_793_000 }, { ...summary, sourceActivityId: 'good' }]
    const src = {
      meta: { id: 'garmin', label: 'x', description: '', auth: 'credentials' as const, available: true, capabilities: { activities: true, detailStreams: false, dailyWellness: false, mode: 'pull' as const, history: true, runs: true } },
      status: async () => ({ connected: true, lastSyncAt: null, error: null }),
      disconnect: async () => {},
      listActivities: async () => ({ items, hasMore: false }),
    }
    const r = await asUser('user-a', () => syncSource(src))
    expect(r).toMatchObject({ inserted: 1, updated: 0, duplicates: 0, failed: 1 })
    expect(r.log).toContain('implausible, skipped: bad (speed)')
    expect(tables['user-a'].map((a) => a.sourceActivityId)).toEqual(['good'])
    const page = await asUser('user-a', () => syncHistoryPage(src, 0))
    expect(page).toMatchObject({ inserted: 0, updated: 1, duplicates: 0, rejected: 1 })
    expect(tables['user-a']).toHaveLength(1)
  })
})

// 08-02 follow-up: a broken watch clock or a damaged file could store a run on 01.01.1970 or in 2099, where it fed
// load and the plan from a day that never was. A start day before EARLIEST_DAY or after tomorrow stops at the ingest
// like the other impossible values; a delivered average speed nobody can reach no longer sets the pace.
describe('Plausibilität: Startdatum und gelieferte Geschwindigkeit', () => {
  const summary = { sourceActivityId: 'd', startUtc: '2026-05-10T06:00:00Z', startLocal: '2026-05-10T08:00:00', sport: 'running', name: null, distanceM: 10000, movingS: 3000, elapsedS: 3100, elevationGainM: null, avgSpeedMs: null, maxSpeedMs: null, avgHr: null, maxHr: null, avgCadenceSpm: null, calories: null, startLat: null, startLng: null }
  const at = (startLocal: string) => ({ ...summary, startLocal, startUtc: null })

  it('vor 2000, nach morgen oder kein Kalendertag → abgelehnt; morgen und der 01.01.2000 bleiben', async () => {
    const { implausible } = await import('@/lib/sources/ingest')
    const latest = '2026-05-11'                                // tomorrow
    expect(implausible(at('1970-01-01T00:00:00'), latest)).toEqual({ check: 'date', message: 'ein Start vor dem 01.01.2000 ist nicht möglich' })
    expect(implausible(at('2099-05-10T08:00:00'), latest)).toEqual({ check: 'date', message: 'ein Start in der Zukunft ist nicht möglich' })
    expect(implausible(at('2026-05-12T08:00:00'), latest)?.check).toBe('date')
    expect(implausible(at('2026-02-31T08:00:00'), latest)).toEqual({ check: 'date', message: 'dieses Startdatum gibt es nicht' })
    expect(implausible(at('2026-05-11T23:30:00'), latest)).toBeNull()
    expect(implausible(at('2000-01-01T06:00:00'), latest)).toBeNull()
  })

  it('Datei von 1970 und von 2099: nicht gespeichert, im Bericht mit Dateiname und Grund', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const r = await asUser('user-a', () => importFiles([
      { name: 'alt.gpx', bytes: strToU8(gpxFile({ ...RUN, start: new Date('1970-01-01T06:00:00Z') })) },
      { name: 'zukunft.fit', bytes: fitFile({ ...RUN, start: new Date('2099-05-10T06:00:00Z') }) },
      { name: 'run.fit', bytes: fitFile() },
    ]))
    expect(r).toMatchObject({ files: 3, inserted: 1, duplicates: 0 })
    expect(r.errors).toEqual([
      { name: 'alt.gpx', message: 'alt.gpx: Aktivität vom 01.01.1970 nicht importiert – ein Start vor dem 01.01.2000 ist nicht möglich.' },
      { name: 'zukunft.fit', message: 'zukunft.fit: Aktivität vom 10.05.2099 nicht importiert – ein Start in der Zukunft ist nicht möglich.' },
    ])
    expect(tables['user-a'].map((a) => a.date)).toEqual(['2026-05-10'])
  })

  it('Sync und Historie einer Quelle: übersprungen und gezählt, der Rest läuft weiter', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables)
    const { syncSource, syncHistoryPage } = await import('@/lib/sources/sync')
    const items = [{ ...at('2099-01-01T08:00:00'), sourceActivityId: 'clock' }, { ...at('1970-01-01T01:00:00'), sourceActivityId: 'epoch' }, { ...summary, sourceActivityId: 'good' }]
    const src = {
      meta: { id: 'garmin', label: 'x', description: '', auth: 'credentials' as const, available: true, capabilities: { activities: true, detailStreams: false, dailyWellness: false, mode: 'pull' as const, history: true, runs: true } },
      status: async () => ({ connected: true, lastSyncAt: null, error: null }),
      disconnect: async () => {},
      listActivities: async () => ({ items, hasMore: false }),
    }
    const r = await asUser('user-a', () => syncSource(src))
    expect(r).toMatchObject({ inserted: 1, failed: 2 })
    expect(r.log).toEqual(expect.arrayContaining(['implausible, skipped: clock (date)', 'implausible, skipped: epoch (date)']))
    expect(await asUser('user-a', () => syncHistoryPage(src, 0))).toMatchObject({ inserted: 0, updated: 1, rejected: 2 })
    expect(tables['user-a'].map((a) => a.sourceActivityId)).toEqual(['good'])
  })

  it('eine unmögliche gelieferte Durchschnittsgeschwindigkeit setzt nicht das Tempo: es kommt aus Distanz und Zeit', async () => {
    const { toActivityRow } = await import('@/lib/sources/ingest')
    // 10 km in 3000 s: 3.33 m/s, 5:00 min/km. The file or watch states 50 m/s (0:20 min/km).
    expect(toActivityRow('file', { ...summary, avgSpeedMs: 50 })).toMatchObject({ averageSpeedMs: 10000 / 3000, averagePaceSPerKm: 300 })
    expect(toActivityRow('file', { ...summary, avgSpeedMs: -3 })).toMatchObject({ averageSpeedMs: 10000 / 3000, averagePaceSPerKm: 300 })
    // A possible one is the source's own (it may count moving time differently): kept as delivered.
    expect(toActivityRow('file', { ...summary, avgSpeedMs: 3.5 })).toMatchObject({ averageSpeedMs: 3.5, averagePaceSPerKm: 286 })
    // A ride may be fast.
    expect(toActivityRow('garmin', { ...summary, sport: 'cycling', avgSpeedMs: 20 })).toMatchObject({ averageSpeedMs: 20 })
  })
})

// 08-02 follow-up: one activity the database did not take ended the whole sync; the activities after it were never
// stored. Now it counts as failed and the others go on, and such a sync covers no days.
describe('Sync: eine Aktivität lässt sich nicht speichern', () => {
  const day = (d: number, id: string) => ({ sourceActivityId: id, startUtc: `2026-05-${d}T06:00:00Z`, startLocal: `2026-05-${d}T08:00:00`, sport: 'running', name: null, distanceM: 10000, movingS: 3000, elapsedS: 3100, elevationGainM: null, avgSpeedMs: null, maxSpeedMs: null, avgHr: null, maxHr: null, avgCadenceSpm: null, calories: null, startLat: null, startLng: null })
  const items = [day(10, 'first'), day(11, 'broken'), day(12, 'last')]
  const source = (marked: unknown[]) => ({
    meta: { id: 'garmin', label: 'x', description: '', auth: 'credentials' as const, available: true, capabilities: { activities: true, detailStreams: false, dailyWellness: false, mode: 'pull' as const, history: true, runs: true } },
    status: async () => ({ connected: true, lastSyncAt: null, error: null }),
    disconnect: async () => {},
    listActivities: async () => ({ items, hasMore: false }),
    markSynced: async (e?: unknown) => { marked.push(e ?? null) },
  })
  const failOn = (ids: string[]) => (q: Query) => {
    if (/^insert into "activities"/.test(q.sql) && ids.some((id) => q.params.includes(id))) throw new Error('value too long: secret-row-content')
  }
  const lastSync = () => JSON.parse(String(fake.log.filter((q) => /^insert into "settings"/.test(q.sql) && q.params.includes('last_sync:garmin')).at(-1)!.params.find((p) => typeof p === 'string' && p.startsWith('{'))))

  it('die übrigen werden gespeichert, sie zählt als fehlgeschlagen, der Sync deckt keine Tage ab', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables, failOn(['broken']))
    const { syncSource } = await import('@/lib/sources/sync')
    const { syncedThroughOf } = await import('@/lib/plan/strength')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const marked: unknown[] = []
    try {
      const r = await asUser('user-a', () => syncSource(source(marked)))
      expect(r).toMatchObject({ inserted: 2, updated: 0, duplicates: 0, failed: 1 })
      expect(r.log).toContain('store failed: broken (unknown)')
      expect(JSON.stringify([r.log, errors.mock.calls])).not.toContain('secret-row-content')
    } finally { errors.mockRestore() }
    expect(tables['user-a'].map((a) => a.sourceActivityId)).toEqual(['first', 'last'])
    expect(lastSync()).toMatchObject({ source: 'garmin', inserted: 2, failed: 1, error: '1 Aktivität konnte nicht gespeichert werden.', errorCode: 'unknown' })
    expect(syncedThroughOf(lastSync(), () => '2026-05-13')).toBeNull()
    expect(marked).toEqual([null])                              // the connection itself is fine

    // The next sync stores it: a complete sync again, and it covers the days before it.
    fake.restore()
    fake = fakeActivities(tables)
    expect(await asUser('user-a', () => syncSource(source(marked)))).toMatchObject({ inserted: 1, updated: 2, failed: 0 })
    expect(lastSync().error).toBeUndefined()
    expect(syncedThroughOf(lastSync(), () => '2026-05-13')).toBe('2026-05-12')
  })

  it('keine lässt sich speichern: der Sync ist fehlgeschlagen, neutral gemeldet', async () => {
    const tables: Record<string, Act[]> = {}
    fake = fakeActivities(tables, failOn(['first', 'broken', 'last']))
    const { syncSource } = await import('@/lib/sources/sync')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const marked: any[] = []
    try {
      await expect(asUser('user-a', () => syncSource(source(marked)))).rejects.toMatchObject({ code: 'unknown', message: 'Synchronisierung fehlgeschlagen. Bitte später erneut versuchen.' })
    } finally { errors.mockRestore() }
    expect(tables['user-a'] ?? []).toEqual([])
    expect(lastSync()).toMatchObject({ inserted: 0, failed: 3, errorCode: 'unknown', error: 'Synchronisierung fehlgeschlagen. Bitte später erneut versuchen.' })
    expect(marked.map((e) => e?.code)).toEqual(['unknown'])
  })
})
