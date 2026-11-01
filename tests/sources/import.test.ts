// AC-2/AC-8/AC-9 (Phase 3): the duplicate rule (start ±2 min, distance ±3 %, any source), the same file twice, the
// same run from another source, and per-user isolation of imports — against the SQL the ingest code sends.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDuplicate } from '@/lib/sources/dedupe'
import { runAsUser } from '@/lib/server/scope'
import { useFakeDb, type Query } from '../scope/fake-db'
import { fitFile, gpxFile, RUN } from './fixtures'
import { strToU8 } from 'fflate'

vi.mock('@/lib/analytics/store-metrics', () => ({ storeRunMetrics: async () => null }))
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
interface Act { id: string; source: string; sourceActivityId: string | null; startedAt: number | null; date: string; startTime: string | null; distanceM: number; type: string }
// The user a query runs for: the first value of an insert, else the parameter compared with "user_id".
const userOf = (q: Query) => {
  if (/^insert/.test(q.sql)) return String(q.params[0])
  const m = q.sql.match(/"user_id" = \$(\d+)/)
  return m ? String(q.params[Number(m[1]) - 1]) : null
}

function fakeActivities(tables: Record<string, Act[]>) {
  const fake = useFakeDb((q: Query) => {
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
    if (/^select "id" from "activities"/.test(q.sql)) {          // by (source, source id)
      const [, source, sid] = q.params                         // user, source, source id
      return rows.filter((r) => r.source === source && r.sourceActivityId === sid).map((r) => [r.id])
    }
    if (/^select "id", "started_at", "date", "start_time", "distance_m" from "activities"/.test(q.sql)) {
      return rows.map((r) => [r.id, r.startedAt, r.date, r.startTime, r.distanceM])
    }
    if (/^select "type" from "activities"/.test(q.sql)) return rows.filter((r) => r.id === q.params[1]).map((r) => [r.type])
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
    const tables: Record<string, Act[]> = { 'user-a': [{ id: 'g1', source: 'garmin', sourceActivityId: '1001', startedAt: T + 60, date: '2026-05-10', startTime: '08:01:00', distanceM: 5150, type: 'Run' }] }
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
    const tables: Record<string, Act[]> = { 'user-a': [{ id: 'a1', source: 'garmin', sourceActivityId: '7', startedAt: T, date: '2026-05-10', startTime: '08:00:00', distanceM: 5100, type: 'Run' }] }
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
