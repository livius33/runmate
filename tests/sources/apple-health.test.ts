// AC-7 (Phase 3): Apple Health as a source — running workouts are skipped only for users with another connected run
// source; otherwise a run with a distance becomes an activity (deduplicated). Through the real Shortcut route.
import { afterAll, describe, expect, it } from 'vitest'
import { parseHealth, parseStart } from '@/lib/health/parse'
import { useFakeDb, type Query } from '../scope/fake-db'

const { POST } = await import('@/app/api/health/[token]/route')

const RUNNING = { type: 'Outdoor Run', start: '2026-05-10T07:00:00+02:00', minutes: 50, distanceKm: '10,2', avgHr: 150, kcal: 600 }
const STRENGTH = { type: 'Traditional Strength Training', start: '2026-05-10T18:00:00+02:00', minutes: 40 }

describe('Lauf-Workouts aus Apple Health', () => {
  it('mit anderer Laufquelle übersprungen, sonst als Lauf übernommen', () => {
    const body = { date: '2026-05-10', steps: 8000, workouts: [RUNNING, STRENGTH] }
    const skip = parseHealth(body, '2026-05-09')
    const keep = parseHealth(body, '2026-05-09', { keepRuns: true })
    if (!skip.ok || !keep.ok) throw new Error('parse failed')
    expect([skip.runs, skip.skipped, skip.workouts!.length]).toEqual([[], 1, 1])
    expect(keep.skipped).toBe(0)
    expect(keep.workouts!.map((w) => w.type)).toEqual(['Traditional Strength Training'])
    expect(keep.runs).toEqual([expect.objectContaining({
      sport: 'running', startUtc: '2026-05-10T05:00:00Z', startLocal: '2026-05-10T07:00:00', distanceM: 10200, movingS: 3000, avgHr: 150, calories: 600,
    })])
  })

  it('Lauf ohne Distanz wird übersprungen; nur Läufe reichen als Inhalt', () => {
    const r = parseHealth({ date: '2026-05-10', workouts: [{ ...RUNNING, distanceKm: undefined }] }, '2026-05-09', { keepRuns: true })
    expect(r).toMatchObject({ ok: false })
    const only = parseHealth({ date: '2026-05-10', workouts: [RUNNING] }, '2026-05-09', { keepRuns: true })
    expect(only).toMatchObject({ ok: true, skipped: 0 })
  })

  it('Startzeit: ISO mit Offset → UTC; deutsch oder ohne Offset → nur Ortszeit', () => {
    expect(parseStart('2026-05-10T07:00:00+02:00', '2026-05-10')).toEqual({ local: '2026-05-10T07:00:00', utc: '2026-05-10T05:00:00Z' })
    expect(parseStart('10.05.2026, 07:05', '2026-05-10')).toEqual({ local: '2026-05-10T07:05:00', utc: null })
    expect(parseStart('2026-05-10 07:05', '2026-05-10')).toEqual({ local: '2026-05-10T07:05:00', utc: null })
    expect(parseStart('heute', '2026-05-10')).toEqual({ local: '2026-05-10T00:00:00', utc: null })
  })
})

describe('Kurzbefehl-Route je Nutzer', () => {
  const TOKENS: Record<string, string> = { ['A'.repeat(32)]: 'with-garmin', ['B'.repeat(32)]: 'apple-only' }
  const fake = useFakeDb((q: Query) => {
    if (/from "link_tokens"/.test(q.sql)) return TOKENS[String(q.params[0])] ? [[TOKENS[String(q.params[0])]]] : []
    if (/^select "session_at".* from "garmin_accounts"/.test(q.sql)) return q.params[0] === 'with-garmin' ? [[1, 1, 1, null, null]] : []
    return []
  })
  afterAll(() => fake.restore())

  const post = (token: string) => POST(
    new Request('http://localhost/api/health/x', { method: 'POST', body: JSON.stringify({ date: '2026-05-10', steps: 8000, workouts: [RUNNING, STRENGTH] }) }),
    { params: Promise.resolve({ token }) },
  )

  it('Nutzer mit Garmin: Lauf ignoriert; Nutzer nur mit Apple Health: Lauf gespeichert', async () => {
    const a = await (await post('A'.repeat(32))).json()
    expect(a).toMatchObject({ ok: true, runs: 0, skippedWorkouts: 1 })
    expect(fake.log.filter((q) => q.sql.startsWith('insert into "activities"'))).toEqual([])

    const b = await (await post('B'.repeat(32))).json()
    expect(b).toMatchObject({ ok: true, runs: 1, duplicateRuns: 0, skippedWorkouts: 0 })
    const ins = fake.log.filter((q) => q.sql.startsWith('insert into "activities"'))
    expect(ins).toHaveLength(1)
    expect(ins[0].params[0]).toBe('apple-only')
    expect(ins[0].params).toContain('apple-health')
  })

  it('unbekanntes Token: 404', async () => {
    expect((await post('C'.repeat(32))).status).toBe(404)
  })
})
