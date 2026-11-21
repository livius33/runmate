// AC-4 (12-04): with the Art. 9 consent required and not given (or revoked), the routes that store health data typed
// in by the user answer 403 consent-required and write nothing; data without health content, reading, export and
// deletion still work.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activities, consents } from '@/lib/db/schema'
import { HEALTH_CONSENT_VERSION } from '@/lib/legal/consent-text'
import { useFakeDb, rowOf } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-c' }) }))

const RUN = { id: 'run-1', source: 'garmin', type: 'running', sportType: 'running', name: 'Lauf', distanceM: 10000, durationS: 3000, elapsedTimeS: 3000, date: '2026-05-10' }
const state = { consent: null as null | { version: string; revokedAt: number | null } }
const fake = useFakeDb((q) => {
  if (/^select .* from "consents"/.test(q.sql) && state.consent) return [rowOf(consents, { userId: 'user-c', kind: 'health', grantedAt: 1_800_000_000, ...state.consent })]
  if (/^select .* from "activities"/.test(q.sql)) {
    return [rowOf(activities, q.params.includes('manual-1') ? { ...RUN, id: 'manual-1', source: 'manual', type: 'Strength', distanceM: 0 } : RUN)]
  }
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; state.consent = null; process.env.REQUIRE_HEALTH_CONSENT = '1' })
afterEach(() => { delete process.env.REQUIRE_HEALTH_CONSENT })

const profile = await import('@/app/api/profile/route')
const run = await import('@/app/api/running/runs/[id]/route')
const cross = await import('@/app/api/cross-training/route')
const crossOne = await import('@/app/api/cross-training/[id]/route')
const week = await import('@/app/api/feedback/week/route')
const runner = await import('@/app/api/runner/profile/route')
const { GET: exportData } = await import('@/app/api/account/export/route')
const { DELETE: deleteHealth } = await import('@/app/api/account/health-data/route')

const body = (method: string, b: unknown) => new Request('http://localhost/api/x', { method, body: JSON.stringify(b) })
const id = (v: string) => ({ params: Promise.resolve({ id: v }) })
const writes = () => fake.log.filter((q) => /^(insert|update|delete)/.test(q.sql))

const withHealth: [string, () => Promise<Response>][] = [
  ['PUT /api/profile (HFmax)', () => profile.PUT(body('PUT', { hrMax: 190, timezone: 'Europe/Berlin' }))],
  ['PUT /api/profile (Gewicht)', () => profile.PUT(body('PUT', { weightKg: 70 }))],
  ['PATCH /api/running/runs/:id (Schmerzen)', () => run.PATCH(body('PATCH', { feel: 2, pain: 'light' }), id('run-1'))],
  ['PATCH /api/running/runs/:id (Notiz)', () => run.PATCH(body('PATCH', { note: 'Knie zwickt' }), id('run-1'))],
  ['PATCH /api/running/runs/:id (RPE)', () => run.PATCH(body('PATCH', { rpe: 7 }), id('run-1'))],
  ['POST /api/cross-training (RPE)', () => cross.POST(body('POST', { date: '2026-05-10', sport: 'Strength', minutes: 30, rpe: 6 }))],
  ['PATCH /api/cross-training/:id (RPE)', () => crossOne.PATCH(body('PATCH', { rpe: 6 }), id('manual-1'))],
  ['PUT /api/feedback/week', () => week.PUT(body('PUT', { week: '2026-05-04', rating: 4, fatigue: 3 }))],
  ['POST /api/runner/profile (Verletzungen)', () => runner.POST(body('POST', { runs_per_week: '5', current_injuries: 'Achillessehne' }))],
  ['PATCH /api/runner/profile (Ruhepuls)', () => runner.PATCH(body('PATCH', { resting_hr: 48 }))],
]

describe('Gesundheitsdaten schreiben nur mit Einwilligung', () => {
  for (const [name, call] of withHealth) {
    it(`ohne Einwilligung: ${name} → 403 consent-required, nichts geschrieben`, async () => {
      const res = await call()
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('consent-required')
      expect(writes()).toEqual([])
    })
  }

  it('widerrufen: wieder gesperrt', async () => {
    state.consent = { version: HEALTH_CONSENT_VERSION, revokedAt: 1_800_000_100 }
    for (const [name, call] of withHealth) expect((await call()).status, name).toBe(403)
  })

  it('mit Einwilligung: gespeichert wie bisher', async () => {
    state.consent = { version: HEALTH_CONSENT_VERSION, revokedAt: null }
    for (const [name, call] of withHealth) expect((await call()).status, name).not.toBe(403)
    expect(writes().length).toBeGreaterThan(0)
  })

  it('ohne Gesundheitsdaten im Body: kein Einwilligungs-Check', async () => {
    expect((await profile.PUT(body('PUT', { timezone: 'Europe/Berlin', easyPace: '5:30' }))).status).toBe(200)
    expect((await run.PATCH(body('PATCH', { runType: null }), id('run-1'))).status).toBe(200)
    expect((await run.PATCH(body('PATCH', { note: null }), id('run-1'))).status).not.toBe(403)          // clearing
    expect((await runner.POST(body('POST', { runs_per_week: '5', best_days: ['Samstag'] }))).status).toBe(200)
    expect((await runner.PATCH(body('PATCH', { weight_kg: null }))).status).toBe(200)
  })

  it('Lesen, Export und Löschen gehen weiter', async () => {
    expect((await profile.GET()).status).toBe(200)
    expect((await runner.GET()).status).toBe(200)
    expect((await week.GET()).status).toBe(200)
    expect((await run.GET(new Request('http://localhost/api/running/runs/run-1'), id('run-1'))).status).toBe(200)
    expect((await exportData()).status).toBe(200)
    expect((await deleteHealth(body('DELETE', { confirm: true }))).status).toBe(200)
  })

  it('self-host (keine Einwilligung nötig): alles wie bisher, keine Abfrage', async () => {
    delete process.env.REQUIRE_HEALTH_CONSENT
    for (const [name, call] of withHealth) expect((await call()).status, name).not.toBe(403)
    expect(fake.log.some((q) => /"consents"/.test(q.sql))).toBe(false)
  })
})
