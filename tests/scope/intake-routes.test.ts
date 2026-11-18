// 08-02 follow-up: what the user routes that take data do with input that cannot be right. Through the real route
// handlers, as a signed-in user, against the fake database.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { activities } from '@/lib/db/schema'
import { runAsUser } from '@/lib/server/scope'
import { rowOf, useFakeDb, type Query } from './fake-db'

const cross = await import('@/app/api/cross-training/route')
const crossOne = await import('@/app/api/cross-training/[id]/route')
const profile = await import('@/app/api/runner/profile/route')

const MANUAL = { id: 'manual-1763000000000', source: 'manual', type: 'Strength', sportType: 'manual', name: 'Kraft', distanceM: 0, durationS: 1800, elapsedTimeS: 1800, date: '2026-05-10' }
const fake = useFakeDb((q: Query) => (/^select .* from "activities"/.test(q.sql) ? [rowOf(activities, MANUAL)] : []))
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0 })

const asUser = <T>(fn: () => Promise<T>) => runAsUser('user-a', fn, { profile: null })
const json = (method: string, body: unknown) => new Request('http://localhost/api/x', { method, body: typeof body === 'string' ? body : JSON.stringify(body) })
const writes = () => fake.log.filter((q) => /^(insert|update|delete)/.test(q.sql))

// A body that is no JSON made req.json() throw: the route answered 500.
describe('Läuferprofil: kein gültiges JSON', () => {
  it.each(['POST', 'PATCH'] as const)('%s mit kaputtem Body: 400, nichts gespeichert', async (method) => {
    for (const body of ['{"experience": ', '', 'null', '[1, 2]', '"text"']) {
      const res = await asUser(() => profile[method](json(method, body))).catch((err: Error) => Response.json({ threw: err.name }, { status: 500 }))
      expect([res.status, await res.json()], JSON.stringify(body)).toEqual([400, { error: 'JSON-Objekt erwartet' }])
    }
    expect(writes()).toEqual([])
  })

  it('ein gültiges Objekt wird wie bisher gespeichert', async () => {
    const res = await asUser(() => profile.POST(json('POST', { experience: 'advanced' })))
    expect([res.status, await res.json()]).toEqual([200, { ok: true }])
    const patched = await asUser(() => profile.PATCH(json('PATCH', { weeklyKm: 50 })))
    expect([patched.status, await patched.json()]).toEqual([200, { ok: true, profile: { weeklyKm: 50 } }])
    expect(writes().map((q) => q.sql.slice(0, 22))).toEqual(['insert into "settings"', 'insert into "settings"'])
  })
})

describe('Cross-Training: Datum', () => {
  const entry = (date: string) => ({ date, sport: 'Strength', minutes: 30, rpe: 6 })

  it.each([
    ['2026-02-31', /Tag gibt es nicht/],       // no such day
    ['2025-02-29', /Tag gibt es nicht/],       // not a leap year
    ['2026-13-01', /Tag gibt es nicht/],
    ['0001-01-01', /frühestens/],
    ['1999-12-31', /frühestens/],
    ['2999-01-01', /Zukunft/],
  ])('POST mit %s: 400 auf Deutsch, nichts gespeichert', async (date, message) => {
    const res = await asUser(() => cross.POST(json('POST', entry(date))))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(message)
    expect(writes()).toEqual([])
  })

  it('PATCH einer manuellen Einheit auf den 31.02.: 400, nichts geändert', async () => {
    const res = await asUser(() => crossOne.PATCH(json('PATCH', { date: '2026-02-31' }), { params: Promise.resolve({ id: MANUAL.id }) }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Tag gibt es nicht/)
    expect(writes()).toEqual([])
  })

  it('ein echter Tag (Schalttag, erster erlaubter Tag) wird gespeichert', async () => {
    for (const date of ['2024-02-29', '2000-01-01']) {
      const res = await asUser(() => cross.POST(json('POST', entry(date))))
      expect(res.status, date).toBe(201)
    }
    expect(writes()).toHaveLength(2)
  })
})
