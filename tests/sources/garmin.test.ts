// AC-3/AC-4/AC-5/AC-6 (Phase 3): the Garmin login source with a fake client — sync and detail through the interface,
// one client per request scope, every login failure as a German error state, consent required, and no credentials or
// tokens in logs, API responses or the SQL parameters.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { encrypt } from '@/lib/crypto'
import { garminAccounts } from '@/lib/db/schema'
import { runAsUser } from '@/lib/server/scope'
import { createGarminClient, setGarminClientFactory } from '@/lib/sources/garmin-login/client'
import { classifyGarminError, GarminHttpError, GarminMfaError, GARMIN_MESSAGES } from '@/lib/sources/garmin-login/errors'
import { SourceError } from '@/lib/sources/types'
import { useFakeDb, rowOf, type Query } from '../scope/fake-db'
import { chart, installFakeGarmin, listActivity } from './garmin-fake'

const clerk = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))
vi.mock('@/lib/analytics/store-metrics', () => ({ storeRunMetrics: async () => null }))
vi.mock('@/lib/plan/engine-store', () => ({ runAndSaveEngine: async () => ({ log: [] }) }))

const { garminLoginSource: garmin } = await import('@/lib/sources/garmin-login')
const { syncSource } = await import('@/lib/sources/sync')
const { PUT: connectRoute } = await import('@/app/api/sources/[id]/connection/route')

const EMAIL = 'runner@example.com', PASSWORD = 'hunter2-secret'
const SECRETS = [EMAIL, PASSWORD, 'oauth1-token-value', 'oauth1-secret-value', 'oauth2-access-value']
const asUser = <T>(id: string, fn: () => Promise<T>) => runAsUser(id, fn, { profile: null })

let fakeGarmin: ReturnType<typeof installFakeGarmin>
let fake: ReturnType<typeof useFakeDb>
let hasAccount = true
let logs: string[] = []

beforeAll(() => { process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64') })
beforeEach(() => {
  fakeGarmin = installFakeGarmin()
  hasAccount = true
  logs = []
  for (const m of ['log', 'error', 'warn', 'info'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')) })
  fake = useFakeDb((q: Query) => {
    if (!/from "garmin_accounts"/.test(q.sql)) return []
    if (!hasAccount) return []
    const user = String(q.params[0])
    if (q.sql.startsWith('select "user_id", "username_enc"')) return [rowOf(garminAccounts, { userId: user, usernameEnc: encrypt(`${user}@example.com`), passwordEnc: encrypt(PASSWORD), updatedAt: 0 })]
    return [[null, 1700000000, 1700000000, 'auth', 1700000100]]
  })
})
afterEach(() => { fake.restore(); fakeGarmin.restore(); vi.restoreAllMocks() })
afterAll(() => setGarminClientFactory(null))

const noSecrets = (text: string) => { for (const s of SECRETS) expect(text).not.toContain(s) }

describe('Verbinden', () => {
  it('meldet sich an und speichert nur verschlüsselt, mit Einwilligung', async () => {
    hasAccount = false
    await asUser('user-a', () => garmin.connect!({ username: EMAIL, password: PASSWORD, consent: true }))
    expect(fakeGarmin.logins).toBe(1)
    const ins = fake.log.find((q) => q.sql.startsWith('insert into "garmin_accounts"'))!
    expect(ins.sql).toMatch(/"consented_at"/)
    noSecrets(JSON.stringify(ins.params))
    expect(ins.params.filter((p) => typeof p === 'string' && p.startsWith('v1.'))).toHaveLength(6)   // username, password, session (values + on conflict)
    noSecrets(logs.join('\n'))
  })

  it('ohne Einwilligung oder ohne Passwort: Fehler, keine Anmeldung, nichts gespeichert', async () => {
    for (const input of [{ username: EMAIL, password: PASSWORD }, { username: EMAIL, password: PASSWORD, consent: false }, { username: EMAIL, consent: true }, null]) {
      await expect(asUser('user-a', () => garmin.connect!(input))).rejects.toMatchObject({ code: 'invalid' })
    }
    expect(fakeGarmin.logins).toBe(0)
    expect(fake.log.filter((q) => q.sql.startsWith('insert'))).toEqual([])
  })

  it.each([
    [new Error('login failed (Ticket not found or MFA), please check username and password'), 'auth'],
    [new GarminMfaError(), 'mfa'],
    [new Error('login failed (AccountLocked), please open connect web page to unlock your account'), 'locked'],
    [new GarminHttpError(429), 'rate-limited'],
    [Object.assign(new Error('Request failed'), { response: { status: 429 } }), 'rate-limited'],
    [new Error('login - csrf not found'), 'login-changed'],
    [new GarminHttpError(403), 'login-changed'],
    [Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' }), 'unavailable'],
    [new GarminHttpError(503), 'unavailable'],
    [new Error('something odd'), 'unknown'],
  ])('Anmeldefehler %# → %s, deutsche Meldung, nichts gespeichert', async (err, code) => {
    hasAccount = false
    fakeGarmin.loginError = err
    const e = await asUser('user-a', () => garmin.connect!({ username: EMAIL, password: PASSWORD, consent: true })).catch((x) => x)
    expect(e).toBeInstanceOf(SourceError)
    expect(e.code).toBe(code)
    expect(e.message).toBe(GARMIN_MESSAGES[code as keyof typeof GARMIN_MESSAGES])
    expect(fake.log.filter((q) => q.sql.startsWith('insert'))).toEqual([])
  })

  it('Route: Fehler mit Zugangsdaten im Bibliothekstext → Antwort und Logs ohne Zugangsdaten', async () => {
    clerk.userId = 'user-a'
    hasAccount = false
    fakeGarmin.loginError = Object.assign(new Error(`login failed for ${EMAIL} / ${PASSWORD} (Ticket not found)`), { config: { data: `username=${EMAIL}&password=${PASSWORD}` } })
    const req = new Request('http://localhost/api/sources/garmin/connection', { method: 'PUT', body: JSON.stringify({ username: EMAIL, password: PASSWORD, consent: true }) })
    const res = await connectRoute(req, { params: Promise.resolve({ id: 'garmin' }) })
    const body = await res.text()
    expect(res.status).toBe(422)
    expect(JSON.parse(body)).toEqual({ ok: false, error: GARMIN_MESSAGES.auth, code: 'auth' })
    noSecrets(body)
    noSecrets(logs.join('\n'))

    fakeGarmin.loginError = null
    const ok = await connectRoute(new Request('http://localhost/x', { method: 'PUT', body: JSON.stringify({ username: EMAIL, password: PASSWORD, consent: true }) }), { params: Promise.resolve({ id: 'garmin' }) })
    expect(ok.status).toBe(200)
    noSecrets(await ok.text())
    noSecrets(logs.join('\n'))
  })

  it('Status: nur Zustand und Fehlercode mit Meldung, nie Werte', async () => {
    const st = await asUser('user-a', () => garmin.status())
    expect(st).toMatchObject({ connected: true, error: { code: 'auth', message: GARMIN_MESSAGES.auth } })
    noSecrets(JSON.stringify(st))
  })
})

describe('Synchronisieren über die Schnittstelle', () => {
  const t0 = Date.parse('2026-05-01T05:00:00Z')

  it('seit-Abfrage blättert, endet am Stichtag und lässt Fremdsportarten weg', async () => {
    fakeGarmin.activities = Array.from({ length: 60 }, (_, i) => listActivity(i, new Date(t0 - i * 86_400_000), i % 5 === 1 ? 'walking' : i % 5 === 2 ? 'strength_training' : 'running'))
    const [{ items, hasMore }, page] = await asUser('user-a', async () => [
      await garmin.listActivities!({ since: new Date(t0 - 54.5 * 86_400_000) }),
      await garmin.listActivities!({ page: 1, pageSize: 50 }),
    ])
    expect(hasMore).toBe(false)
    expect(items).toHaveLength(44)                  // 55 days, 11 walks left out
    expect(items.every((a) => a.sport !== 'walking')).toBe(true)
    expect(items[0]).toMatchObject({ sourceActivityId: '1000', startUtc: '2026-05-01T05:00:00Z', startLocal: '2026-05-01T07:00:00', distanceM: 10000 })
    expect(page).toMatchObject({ hasMore: false })
    expect(page.items).toHaveLength(8)
    expect(fakeGarmin.created).toHaveLength(1)       // one client for the whole scope (request)
  })

  it('ein Client je Nutzer und Anfrage, mit dessen Zugangsdaten', async () => {
    fakeGarmin.activities = [listActivity(0, new Date(t0))]
    await Promise.all(['user-a', 'user-b', 'user-a'].map((u) => asUser(u, () => garmin.listActivities!({ page: 0, pageSize: 10 }))))
    expect(fakeGarmin.created.map((c) => c.username).sort()).toEqual(['user-a@example.com', 'user-a@example.com', 'user-b@example.com'])
  })

  it('Details: Runden und ausgerichtete Streams (parseDetailStreams)', async () => {
    const d = await asUser('user-a', () => garmin.getActivityDetail!('1000'))
    expect(d.laps).toEqual([
      { distanceM: 1000, durationS: 330, elevationGainM: 4, avgSpeedMs: 3.03, avgHr: 144 },
      { distanceM: 1000, durationS: 325, elevationGainM: 2, avgSpeedMs: 3.08, avgHr: 147 },
    ])
    const s = d.streams!
    expect(s.time).toHaveLength(120)
    expect(s.cadence![0]).toBe(172)                   // per leg × 2
    expect(s.heartrate![3]).toBeNull()                // gaps stay aligned
    expect(s.latlng![0]).toEqual([47, 8])
    expect(s).toEqual(expect.objectContaining({ temperature: null }))
    expect(chart().activityDetailMetrics).toHaveLength(120)
  })

  it('abgelaufene Sitzung → neue Anmeldung; falsches Passwort → Fehlerzustand gespeichert', async () => {
    fakeGarmin.loginError = new Error('login failed (Ticket not found or MFA), please check username and password')
    await expect(asUser('user-a', () => syncSource(garmin))).rejects.toMatchObject({ code: 'auth' })
    const errUpdate = fake.log.find((q) => q.sql.startsWith('update "garmin_accounts" set "synced_at"'))!
    expect(errUpdate.params).toContain('auth')
    const lastSync = fake.log.find((q) => q.sql.startsWith('insert into "settings"') && q.params[1] === 'last_sync:garmin')!
    expect(JSON.parse(String(lastSync.params[2]))).toMatchObject({ source: 'garmin', errorCode: 'auth', error: GARMIN_MESSAGES.auth })
    noSecrets(JSON.stringify(fake.log.map((q) => q.params)))
  })

  it('erfolgreicher Sync: neue Aktivitäten, Fehlerzustand gelöscht', async () => {
    fakeGarmin.activities = [listActivity(0, new Date(Date.now() - 86_400_000)), listActivity(1, new Date(Date.now() - 2 * 86_400_000), 'cycling')]
    const r = await asUser('user-a', () => syncSource(garmin))
    expect(r).toMatchObject({ inserted: 2, updated: 0 })
    const inserts = fake.log.filter((q) => q.sql.startsWith('insert into "activities"'))
    expect(inserts).toHaveLength(2)
    for (const q of inserts) expect(q.params).toContain('garmin')
    const ok = fake.log.find((q) => q.sql.startsWith('update "garmin_accounts" set "synced_at"'))!
    expect(ok.params.slice(1, 3)).toEqual([null, null])   // error_code, error_at cleared
  })

  it('ohne Konto: not-connected, ohne Anmeldeversuch', async () => {
    hasAccount = false
    await expect(asUser('user-a', () => garmin.listActivities!({ page: 0, pageSize: 1 }))).rejects.toMatchObject({ code: 'not-connected' })
    expect(fakeGarmin.created).toEqual([])
  })
})

describe('Gehärteter Bibliotheks-Client', () => {
  it('erkennt die MFA-Seite, meldet HTTP-Fehler ohne Antworttext', () => {
    setGarminClientFactory(null)
    const http = (createGarminClient({ username: 'x@example.com', password: 'y' }) as any).client
    expect(() => http.handleMFA('<title>Enter MFA Code</title><form id="verifyMFA">')).toThrow(GarminMfaError)
    expect(() => http.handleMFA('<script>var x = "https://sso.garmin.com/sso/embed?ticket=ST-123"</script>')).not.toThrow()
    expect(() => http.handleHttpError({ status: 429, statusText: 'Too Many', data: { secret: 'x' } })).toThrow(GarminHttpError)
    expect(logs).toEqual([])
    expect(classifyGarminError(new GarminHttpError(404), 'request').code).toBe('unknown')
    expect(classifyGarminError(new GarminHttpError(401)).code).toBe('auth')
  })
})
