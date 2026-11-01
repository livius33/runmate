// AC-1 (Phase 3): every registered source keeps the ActivitySource contract — the methods match the declared
// capabilities, summaries are normalised, details have aligned streams and valid laps — fed with synthetic fixtures
// (a fake Garmin client, FIT/GPX/TCX/ZIP files, an Apple Health payload). Unavailable sources say so and throw.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { strToU8 } from 'fflate'
import { SOURCES } from '@/lib/sources/registry'
import { isUploadSource, SourceError, type ActivityDetail, type ActivitySource, type ActivitySummary } from '@/lib/sources/types'
import { toActivityRow } from '@/lib/sources/ingest'
import { isImportedSport } from '@/lib/sources/sports'
import { parseHealth } from '@/lib/health/parse'
import { encrypt } from '@/lib/crypto'
import { garminAccounts, healthDays } from '@/lib/db/schema'
import { runAsUser } from '@/lib/server/scope'
import { useFakeDb, rowOf } from '../scope/fake-db'
import { fitFile, garminExportZip, gpxFile, RUN, tcxFile } from './fixtures'
import { installFakeGarmin, listActivity } from './garmin-fake'

const asUser = <T>(fn: () => Promise<T>) => runAsUser('user-a', fn, { profile: null })

let fake: ReturnType<typeof useFakeDb>
let garmin: ReturnType<typeof installFakeGarmin>
beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
  garmin = installFakeGarmin()
  const t0 = Date.parse('2026-05-01T05:00:00Z')
  garmin.activities = Array.from({ length: 7 }, (_, i) => listActivity(i, new Date(t0 + i * 86_400_000), ['running', 'trail_running', 'strength_training', 'walking', 'cycling', 'treadmill_running', 'running'][i]))
    .reverse()
  const account = rowOf(garminAccounts, { userId: 'user-a', usernameEnc: encrypt('runner@example.com'), passwordEnc: encrypt('pw'), updatedAt: 0 })
  const day = rowOf(healthDays, { userId: 'user-a', date: '2026-05-10', sleepMin: 450, restingHr: 48, hrvMs: 61.5, steps: 9000, activeKcal: 600, weightKg: 70, source: 'apple-health', updatedAt: 0 })
  fake = useFakeDb((q) => {
    if (/from "garmin_accounts"/.test(q.sql)) return q.sql.startsWith('select "user_id", "username_enc"') ? [account] : [[null, null, null, null, null]]
    if (/from "health_days"/.test(q.sql)) return q.params.includes('2026-05-10') ? [day] : []
    return []
  })
})
afterAll(() => { fake.restore(); garmin.restore() })

// What each source delivers from its fixtures: summaries and details.
async function deliveries(s: ActivitySource): Promise<{ summaries: ActivitySummary[]; details: ActivityDetail[] }> {
  if (isUploadSource(s)) {
    const files: [string, Uint8Array][] = [
      ['run.fit', fitFile()], ['run.gpx', strToU8(gpxFile())], ['run.tcx', strToU8(tcxFile())],
      ['export.zip', garminExportZip({ 'a.fit': fitFile({ ...RUN, sport: 'trail' }), 'b.gpx': gpxFile({ ...RUN, sport: 'cycling' }) })],
    ]
    const parsed = (await Promise.all(files.map(([n, b]) => s.parseFile(n, b)))).flat()
    return { summaries: parsed.map((p) => p.summary), details: parsed.map((p) => p.detail) }
  }
  if (s.meta.id === 'apple-health') {
    const r = parseHealth({ date: '2026-05-10', steps: 9000, workouts: [{ type: 'Outdoor Run', start: '2026-05-10T07:00:00+02:00', minutes: 50, distanceKm: '10,2', avgHr: 150 }] }, '2026-05-09', { keepRuns: true })
    if (!r.ok) throw new Error(r.error)
    return { summaries: r.runs, details: [] }
  }
  const summaries = [
    ...(await s.listActivities!({ since: new Date('2026-04-01T00:00:00Z') })).items,
    ...(await s.listActivities!({ page: 0, pageSize: 3 })).items,
  ]
  const details = await Promise.all(summaries.slice(0, 2).map((a) => s.getActivityDetail!(a.sourceActivityId)))
  return { summaries, details }
}

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const nonNeg = (v: number | null) => v == null || (Number.isFinite(v) && v >= 0)

function checkSummary(a: ActivitySummary) {
  expect(a.sourceActivityId).toMatch(/^\S+$/)
  expect(a.startLocal).toMatch(LOCAL)
  if (a.startUtc != null) {
    expect(a.startUtc).toMatch(/Z$/)
    expect(Number.isFinite(Date.parse(a.startUtc))).toBe(true)
    // Local time is within ±14 h of UTC.
    expect(Math.abs(Date.parse(`${a.startLocal}Z`) - Date.parse(a.startUtc))).toBeLessThanOrEqual(14 * 3600_000)
  }
  expect(a.sport).toMatch(/^[a-z_]+$/)
  for (const k of ['distanceM', 'movingS', 'elapsedS', 'elevationGainM', 'avgSpeedMs', 'maxSpeedMs', 'avgHr', 'maxHr', 'avgCadenceSpm', 'calories'] as const) {
    expect(nonNeg(a[k]), `${k} = ${a[k]}`).toBe(true)
  }
  if (a.startLat != null) expect(Math.abs(a.startLat)).toBeLessThanOrEqual(90)
  if (a.startLng != null) expect(Math.abs(a.startLng)).toBeLessThanOrEqual(180)
  // Every summary maps to a row without losing the day.
  const row = toActivityRow('x', a)
  expect(row.date).toBe(a.startLocal.slice(0, 10))
  expect(row.type.length).toBeGreaterThan(0)
}

function checkDetail(d: ActivityDetail) {
  for (const l of d.laps) for (const v of Object.values(l)) expect(nonNeg(v as number | null)).toBe(true)
  if (!d.streams) return
  const present = Object.entries(d.streams).filter(([, v]) => v != null) as [string, unknown[]][]
  expect(present.length).toBeGreaterThan(0)
  const n = present[0][1].length
  for (const [k, v] of present) expect(v.length, `${k} aligned`).toBe(n)
  expect(n).toBeLessThanOrEqual(1000)
  const time = d.streams.time!.filter((t): t is number => t != null)
  for (let i = 1; i < time.length; i++) expect(time[i]).toBeGreaterThanOrEqual(time[i - 1])
  const dist = (d.streams.distance ?? []).filter((x): x is number => x != null)
  for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1])
  for (const p of d.streams.latlng ?? []) if (p) expect(Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180).toBe(true)
}

describe.each(SOURCES.map((s) => [s.meta.id, s] as const))('Quelle %s', (_id, s) => {
  const c = s.meta.capabilities

  it('Metadaten vollständig, Fähigkeiten passen zu den Methoden', () => {
    expect(s.meta.label.length).toBeGreaterThan(0)
    expect(s.meta.description.length).toBeGreaterThan(0)
    expect(typeof s.status).toBe('function')
    expect(typeof s.disconnect).toBe('function')
    if (c.mode === 'pull') {
      expect(typeof s.listActivities).toBe('function')
      expect(typeof s.connectedUsers).toBe('function')
    }
    if (c.mode === 'pull' && c.detailStreams) expect(typeof s.getActivityDetail).toBe('function')
    if (c.mode === 'upload') expect(isUploadSource(s)).toBe(true)
    if (c.dailyWellness) expect(typeof s.getDaily).toBe('function')
    if (s.meta.auth === 'credentials' || s.meta.auth === 'oauth' || s.meta.auth === 'link') expect(typeof s.connect).toBe('function')
    if (c.history) expect(c.mode === 'pull' || c.mode === 'upload').toBe(true)
  })

  if (!s.meta.available) {
    it('nicht verfügbar: jede Methode wirft SourceError(unavailable)', async () => {
      for (const call of [() => s.connect!({}), () => s.listActivities!({ page: 0, pageSize: 1 }), () => s.getActivityDetail!('1'), () => s.getDaily!('2026-05-10')]) {
        await expect(call()).rejects.toMatchObject({ code: 'unavailable' })
        await call().catch((e) => expect(e).toBeInstanceOf(SourceError))
      }
      expect(await s.status()).toMatchObject({ connected: false })
    })
    return
  }

  it('liefert normalisierte Aktivitäten und Details', async () => {
    const { summaries, details } = await asUser(() => deliveries(s))
    expect(summaries.length).toBeGreaterThan(0)
    summaries.forEach(checkSummary)
    if (c.mode !== 'push') expect(summaries.every((a) => isImportedSport(a.sport))).toBe(true)
    if (c.detailStreams) {
      expect(details.length).toBeGreaterThan(0)
      details.forEach(checkDetail)
      expect(details.some((d) => d.streams?.heartrate && d.streams.distance && d.streams.time)).toBe(true)
    }
  })

  if (c.dailyWellness) {
    it('Tageswerte für ein Datum, null ohne Daten', async () => {
      const day = await asUser(() => s.getDaily!('2026-05-10'))
      expect(day).toMatchObject({ date: '2026-05-10', restingHr: 48, steps: 9000 })
      expect(await asUser(() => s.getDaily!('2026-05-11'))).toBeNull()
    })
  }

  it('Status ohne Geheimnisse', async () => {
    const st = await asUser(() => s.status())
    expect(typeof st.connected).toBe('boolean')
    expect(JSON.stringify(st)).not.toMatch(/runner@example\.com|oauth|password/i)
  })
})
