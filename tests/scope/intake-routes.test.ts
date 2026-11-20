// 08-02 follow-up: what the user routes that take data do with input that cannot be right. Through the real route
// handlers, as a signed-in user, against the fake database.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activities } from '@/lib/db/schema'
import { runAsUser } from '@/lib/server/scope'
import { rowOf, useFakeDb, type Query } from './fake-db'

const cross = await import('@/app/api/cross-training/route')
const crossOne = await import('@/app/api/cross-training/[id]/route')
const profile = await import('@/app/api/runner/profile/route')

const MANUAL = { id: 'manual-1763000000000', source: 'manual', type: 'Strength', sportType: 'manual', name: 'Kraft', distanceM: 0, durationS: 1800, elapsedTimeS: 1800, date: '2026-05-10' }
const state = { profile: null as string | null }                // the stored runner profile (settings value)
const fake = useFakeDb((q: Query) => {
  if (/^select .* from "activities"/.test(q.sql)) return [rowOf(activities, MANUAL)]
  if (/^select .* from "settings"/.test(q.sql) && state.profile) return [[state.profile]]
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; state.profile = null })

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

  it('gültige Antworten werden wie bisher gespeichert', async () => {
    const res = await asUser(() => profile.POST(json('POST', { runs_per_week: '5', best_days: ['Dienstag', 'Samstag'], has_physio: false, marathon_pr: 'noch keinen' })))
    expect([res.status, await res.json()]).toEqual([200, { ok: true }])
    const patched = await asUser(() => profile.PATCH(json('PATCH', { current_weekly_km: 50, weight_kg: null })))
    expect([patched.status, await patched.json()]).toEqual([200, { ok: true, profile: { current_weekly_km: 50, weight_kg: null } }])
    expect(writes().map((q) => q.sql.slice(0, 22))).toEqual(['insert into "settings"', 'insert into "settings"'])
  })
})

// The route stored any JSON object as the profile: any key, any shape, any size.
describe('Läuferprofil: nur Antworten auf die Fragen', () => {
  const storedJson = () => JSON.parse(String(writes().at(-1)!.params.find((p) => typeof p === 'string' && p.startsWith('{'))))

  it('Schlüssel, die keine Frage sind, werden nicht gespeichert', async () => {
    const res = await asUser(() => profile.POST(json('POST', { runs_per_week: '5', experience: 'advanced', nested: { a: [1, 2] }, blob: 'x'.repeat(5000) })))
    expect(res.status).toBe(200)
    expect(storedJson()).toEqual({ runs_per_week: '5' })
  })

  it.each([
    [{ current_weekly_km: '50' }, 'current_weekly_km: Zahl von 0 bis 100.000 erwartet'],
    [{ current_weekly_km: -1 }, 'current_weekly_km: Zahl von 0 bis 100.000 erwartet'],
    [{ has_physio: 'ja' }, 'has_physio: true oder false erwartet'],
    [{ runs_per_week: 5 }, 'runs_per_week: eine der vorgegebenen Antworten erwartet'],
    [{ runs_per_week: '12' }, 'runs_per_week: eine der vorgegebenen Antworten erwartet'],
    [{ best_days: 'Dienstag' }, 'best_days: Liste aus den vorgegebenen Antworten erwartet'],
    [{ best_days: ['Dienstag', 'Feiertag'] }, 'best_days: Liste aus den vorgegebenen Antworten erwartet'],
    [{ primary_race: { name: 'Berlin' } }, 'primary_race: Text erwartet (höchstens 500 Zeichen)'],
    [{ primary_race: 'x'.repeat(501) }, 'primary_race: Text erwartet (höchstens 500 Zeichen)'],
  ])('%j: 400 auf Deutsch, nichts gespeichert', async (body, error) => {
    for (const method of ['POST', 'PATCH'] as const) {
      const res = await asUser(() => profile[method](json(method, body)))
      expect([res.status, await res.json()], method).toEqual([400, { error }])
    }
    expect(writes()).toEqual([])
  })

  it('PATCH prüft nur, was kommt: ein früher gespeichertes Profil bleibt, wie es ist', async () => {
    const old = { experience: 'advanced', runs_per_week: 5 }           // stored before the check: an unknown key, a number
    state.profile = JSON.stringify(old)
    const res = await asUser(() => profile.PATCH(json('PATCH', { weight_kg: 70, shoe_size: 44 })))
    expect([res.status, await res.json()]).toEqual([200, { ok: true, profile: { ...old, weight_kg: 70 } }])
    expect(await (await asUser(() => profile.GET())).json()).toEqual(old)
  })
})

// The id was `manual-${Date.now()}`: two entries in the same millisecond (a double tap, two tabs) got the same one,
// and the second insert broke the primary key (user, id).
describe('Cross-Training: Ids', () => {
  const at = (id: string) => ({ params: Promise.resolve({ id }) })

  it('zwei Einheiten in derselben Millisekunde bekommen verschiedene Ids', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1763000000000)
    try {
      for (const minutes of [30, 45]) expect((await asUser(() => cross.POST(json('POST', { date: '2026-05-10', sport: 'Strength', minutes })))).status).toBe(201)
    } finally { now.mockRestore() }
    const ids = writes().map((q) => q.params.find((p) => typeof p === 'string' && p.startsWith('manual-')))
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    for (const id of ids) expect(id).toMatch(/^manual-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it.each([MANUAL.id, 'manual-3f0c2a9e-5b1d-4c7a-9e2f-6d8b0a1c4e57'])('%s lässt sich ändern und löschen (altes und neues Format)', async (id) => {
    const patched = await asUser(() => crossOne.PATCH(json('PATCH', { minutes: 40 }), at(id)))
    expect(patched.status).toBe(200)
    const deleted = await asUser(() => crossOne.DELETE(json('DELETE', {}), at(id)))
    expect(deleted.status).toBe(200)
    expect(writes().map((q) => [q.sql.slice(0, 6), q.params.includes(id)])).toEqual([['update', true], ['delete', true]])
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

  // GET ?from=&to= went into the query as sent: the date column is text, so '1.5.2026' compared as text.
  it.each([
    ['from=1.5.2026', 'from'],
    ['from=2026-5-1', 'from'],
    ['from=2026-02-31', 'from'],
    ['from=2026-05-01&to=gestern', 'to'],
    ['to=2026-05-01%27%20or%201=1', 'to'],
  ])('GET ?%s: 400 auf Deutsch, keine Abfrage', async (query, param) => {
    const res = await asUser(() => cross.GET(new Request(`http://localhost/api/cross-training?${query}`)))
    expect([res.status, await res.json()]).toEqual([400, { error: `${param}: ein Kalendertag als JJJJ-MM-TT` }])
    expect(fake.log).toEqual([])
  })

  it('GET mit echten Tagen oder ohne Grenzen: die Einheiten', async () => {
    for (const query of ['', '?from=2026-05-01&to=2026-05-31', '?from=&to=2024-02-29']) {
      const res = await asUser(() => cross.GET(new Request(`http://localhost/api/cross-training${query}`)))
      expect([res.status, (await res.json()).length], query).toEqual([200, 1])
    }
    expect(fake.log.at(-2)!.params).toEqual(expect.arrayContaining(['2026-05-01', '2026-05-31']))
  })

  it('ein echter Tag (Schalttag, erster erlaubter Tag) wird gespeichert', async () => {
    for (const date of ['2024-02-29', '2000-01-01']) {
      const res = await asUser(() => cross.POST(json('POST', entry(date))))
      expect(res.status, date).toBe(201)
    }
    expect(writes()).toHaveLength(2)
  })
})
