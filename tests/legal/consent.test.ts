// AC-10 (Phase 4): on a hosted instance no data comes in before the separate Art. 9 consent; it is stored with time
// and text version, revoking blocks again, and a self-hosted install never asks.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consents, subscription } from '@/lib/db/schema'
import { HEALTH_CONSENT_VERSION } from '@/lib/legal/consent-text'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-c' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))
const synced = vi.hoisted(() => [] as string[])
vi.mock('@/lib/sources/registry', async (orig) => ({ ...(await orig<typeof import('@/lib/sources/registry')>()), usersToSync: async () => ['user-c'] }))
vi.mock('@/lib/sources/sync', async (orig) => ({ ...(await orig<typeof import('@/lib/sources/sync')>()), runSync: async () => { synced.push('user-c'); return {} } }))

const TOKEN = 'a'.repeat(32)
const state = { consent: null as null | { version: string; revokedAt: number | null } }
const fake = useFakeDb((q) => {
  if (/from "link_tokens"/.test(q.sql)) return [['user-c']]
  if (/from "subscription"/.test(q.sql)) return [rowOf(subscription, { userId: 'user-c', status: 'active', tier: 'plus', cancelAtPeriodEnd: false, updatedAt: 0 })]
  if (/^select .* from "consents"/.test(q.sql) && state.consent) return [rowOf(consents, { userId: 'user-c', kind: 'health', grantedAt: 1_800_000_000, ...state.consent })]
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; state.consent = null; process.env.BILLING_ENABLED = '1' })
afterEach(() => { delete process.env.BILLING_ENABLED })

const { PUT: connect } = await import('@/app/api/sources/[id]/connection/route')
const { POST: importFiles } = await import('@/app/api/import/route')
const { POST: syncNow } = await import('@/app/api/sources/sync/route')
const { POST: healthLink } = await import('@/app/api/health-link/route')
const { POST: healthPush } = await import('@/app/api/health/[token]/route')
const consentRoute = await import('@/app/api/consent/health/route')

const garminConnect = () => connect(new Request('http://localhost/api/sources/garmin/connection', { method: 'PUT', body: JSON.stringify({ username: 'runner@example.com', password: 'x', consent: true }) }), { params: Promise.resolve({ id: 'garmin' }) })
const emptyImport = () => importFiles(new Request('http://localhost/api/import', { method: 'POST', body: new FormData() }))
const intakes: [string, () => Promise<Response>][] = [
  ['Garmin verbinden', garminConnect],
  ['Datei-Import', emptyImport],
  ['Sync', () => syncNow()],
  ['Apple-Health-Link anlegen', () => healthLink(new Request('http://localhost/api/health-link', { method: 'POST' }))],
  ['Apple-Health-Upload', () => healthPush(new Request(`http://localhost/api/health/${TOKEN}`, { method: 'POST', body: '{}' }), { params: Promise.resolve({ token: TOKEN }) })],
]

describe('Einwilligung Gesundheitsdaten (Art. 9)', () => {
  for (const [name, call] of intakes) {
    it(`ohne Einwilligung: ${name} → 403 consent-required, nichts geschrieben`, async () => {
      const res = await call()
      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('consent-required')
      expect(fake.log.filter((q) => /^(insert|update|delete)/.test(q.sql))).toEqual([])
    })
  }

  it('mit Einwilligung in der aktuellen Version: der Import läuft (scheitert erst an der leeren Anfrage)', async () => {
    state.consent = { version: HEALTH_CONSENT_VERSION, revokedAt: null }
    const res = await emptyImport()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/multipart|Datei/)
  })

  it('widerrufen oder ältere Textversion: wieder gesperrt', async () => {
    state.consent = { version: HEALTH_CONSENT_VERSION, revokedAt: 1_800_000_100 }
    expect((await emptyImport()).status).toBe(403)
    state.consent = { version: '2020-01-01', revokedAt: null }
    expect((await emptyImport()).status).toBe(403)
  })

  it('Erteilen speichert Version und Zeitpunkt; nur die aktuelle Version', async () => {
    const before = Math.floor(Date.now() / 1000)
    const put = (body: unknown) => consentRoute.PUT(new Request('http://localhost/api/consent/health', { method: 'PUT', body: JSON.stringify(body) }))
    expect((await put({ version: HEALTH_CONSENT_VERSION })).status).toBe(400)                 // no explicit consent
    expect((await put({ version: 'alt', consent: true })).status).toBe(409)
    expect((await put({ version: HEALTH_CONSENT_VERSION, consent: true })).status).toBe(200)
    const ins = fake.log.find((q) => q.sql.startsWith('insert into "consents"'))!
    expect(ins.params.slice(0, 3)).toEqual(['user-c', 'health', HEALTH_CONSENT_VERSION])
    expect(Number(ins.params[3])).toBeGreaterThanOrEqual(before)
  })

  it('Widerruf setzt revoked_at für diesen Nutzer', async () => {
    await consentRoute.DELETE()
    const upd = fake.log.find((q) => q.sql.startsWith('update "consents"'))!
    expect(upd.sql).toMatch(/"revoked_at" = \$1/)
    expect(upd.params).toContain('user-c')
  })

  it('der tägliche Sync überspringt Nutzer ohne Einwilligung', async () => {
    process.env.CRON_SECRET = 'cron-test'
    const { GET: cron } = await import('@/app/api/cron/daily-sync/route')
    const res = await cron(new Request('http://localhost/api/cron/daily-sync', { headers: { authorization: 'Bearer cron-test' } }) as never)
    expect(await res.json()).toMatchObject({ users: 1, synced: 0, inactive: 1 })
    expect(synced).toEqual([])
  })

  it('self-host: keine Einwilligung nötig, keine Abfrage', async () => {
    delete process.env.BILLING_ENABLED
    const res = await consentRoute.GET()
    expect(await res.json()).toMatchObject({ required: false, granted: true })
    expect(fake.log.some((q) => /"consents"/.test(q.sql))).toBe(false)
    expect((await emptyImport()).status).toBe(400)
  })
})
