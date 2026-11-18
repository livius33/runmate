// AC-7 (Phase 3): Apple Health as a source — running workouts are skipped only for users with another connected run
// source; otherwise a run with a distance becomes an activity (deduplicated). Through the real Shortcut route.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { parseHealth, parseStart } from '@/lib/health/parse'
import { currentScope } from '@/lib/scope'
import { useFakeDb, type Query } from '../scope/fake-db'

// The engine is a stand-in: `events` holds the route's writes and the engine run (with its user) in their order.
const events = vi.hoisted(() => [] as string[])
vi.mock('@/lib/plan/engine-store', () => ({ runAndSaveEngine: async () => { events.push(`engine ${currentScope().userId}`); return { log: [] } } }))

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
  const db = { fail: null as RegExp | null }      // a database error on the first matching statement
  const fake = useFakeDb((q: Query) => {
    if (db.fail?.test(q.sql)) { db.fail = null; throw new Error('connection lost') }
    const write = q.sql.match(/^(?:insert into|update|delete from) "\w+"/)?.[0]
    if (write) events.push(write)
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

  it('Lauf mit unmöglichen Werten (400 km in einer Minute): nicht gespeichert, in der Antwort gezählt', async () => {
    fake.log.length = 0
    const body = { date: '2026-05-10', steps: 8000, workouts: [{ ...RUNNING, minutes: 1, distanceKm: 400 }, { ...RUNNING, start: '2026-05-10T19:00:00+02:00' }] }
    const res = await POST(new Request('http://localhost/api/health/x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ token: 'B'.repeat(32) }) })
    expect(await res.json()).toMatchObject({ ok: true, runs: 1, duplicateRuns: 0, rejectedRuns: 1 })
    expect(fake.log.filter((q) => q.sql.startsWith('insert into "activities"'))).toHaveLength(1)
  })

  // 08-02 follow-up: the last-upload record was written before the runs, and the plan never heard of a new run.
  it('Reihenfolge: erst die Läufe, dann der Tag mit dem „letzten Upload“, dann die Engine für diesen Nutzer', async () => {
    events.length = 0
    expect(await (await post('B'.repeat(32))).json()).toMatchObject({ ok: true, runs: 1 })
    expect(events).toEqual(['insert into "activities"', 'insert into "health_days"', 'insert into "health_workouts"', 'delete from "health_workouts"', 'insert into "settings"', 'engine apple-only'])
  })

  it('kein Lauf gespeichert (andere Laufquelle): die Engine läuft nicht', async () => {
    events.length = 0
    expect(await (await post('A'.repeat(32))).json()).toMatchObject({ ok: true, runs: 0 })
    expect(events).toEqual(['insert into "health_days"', 'insert into "health_workouts"', 'delete from "health_workouts"', 'insert into "settings"'])
  })

  it('der Lauf lässt sich nicht speichern: Fehler, kein „letzter Upload“; erneut gesendet ist alles da', async () => {
    events.length = 0
    db.fail = /^insert into "activities"/
    await expect(post('B'.repeat(32))).rejects.toThrow('connection lost')
    expect(events).toEqual([])
    expect(await (await post('B'.repeat(32))).json()).toMatchObject({ ok: true, runs: 1, values: 2 })
    expect(events.filter((e) => /settings|engine/.test(e))).toEqual(['insert into "settings"', 'engine apple-only'])
  })

  // 08-02 follow-up: the route stored whatever day the Shortcut named.
  it.each([
    ['2026-02-31', /Tag gibt es nicht/],
    ['31.02.2026', /Tag gibt es nicht/],
    ['0001-01-01', /frühestens/],
    ['2999-01-01', /Zukunft/],
  ])('Datum %s: 400 auf Deutsch, nichts gespeichert', async (date, message) => {
    fake.log.length = 0
    const res = await POST(new Request('http://localhost/api/health/x', { method: 'POST', body: JSON.stringify({ date, steps: 8000, workouts: [STRENGTH] }) }), { params: Promise.resolve({ token: 'B'.repeat(32) }) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(message)
    expect(fake.log.filter((q) => /^(insert|update|delete)/.test(q.sql))).toEqual([])
  })

  it('unbekanntes Token: 404', async () => {
    expect((await post('C'.repeat(32))).status).toBe(404)
  })
})
