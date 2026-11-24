// AC-5 (12-04): the sixth failed Garmin sign-in of one account inside an hour is refused with 429 and Retry-After
// before Garmin is contacted; a success clears the count. Sync, history import, forced enrich and export have a
// per-user cooldown; the first use is never held up.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SourceError } from '@/lib/sources/types'
import { LIMITS, recent, retryAfter } from '@/lib/server/throttle'
import { useFakeDb } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-t' }) }))

// The settings store as a map per user, so counters are visible and per account.
const store = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/lib/db/settings', async (orig) => {
  const { scopeUserId } = await import('@/lib/scope')
  return {
    ...(await orig<typeof import('@/lib/db/settings')>()),
    getSettingJson: async (k: string) => store.get(`${scopeUserId()}/${k}`) ?? null,
    setSettingJson: async (k: string, v: unknown) => { store.set(`${scopeUserId()}/${k}`, v) },
  }
})

const garmin = vi.hoisted(() => ({ contacts: 0, password: 'richtig' }))
vi.mock('@/lib/sources/registry', async (orig) => {
  const fakeSource = {
    meta: { id: 'garmin', available: true, capabilities: { mode: 'pull', detailStreams: true } },
    async connect(input: { password?: string } | null) {
      if (!input?.password) throw new SourceError('invalid', 'Bitte E-Mail und Passwort angeben.')
      garmin.contacts++
      if (input.password !== garmin.password) throw new SourceError('auth', 'Garmin hat die Anmeldung abgelehnt.')
      return { connected: true }
    },
    async getActivityDetail() { garmin.contacts++; return {} },
  }
  return { ...(await orig<typeof import('@/lib/sources/registry')>()), source: () => fakeSource }
})
const work = vi.hoisted(() => ({ syncs: 0, pages: 0, enriched: 0, exports: 0 }))
vi.mock('@/lib/sources/sync', async (orig) => ({
  ...(await orig<typeof import('@/lib/sources/sync')>()),
  runSync: async () => { work.syncs++; return {} },
  syncHistoryPage: async () => { work.pages++; return { inserted: 0, updated: 0, duplicates: 0, rejected: 0, hasMore: true } },
  enrichActivity: async () => { work.enriched++ },
}))
vi.mock('@/lib/account/data', () => ({ exportUserData: async () => { work.exports++; return new Uint8Array([1]) } }))

// The enrich route selects source, sourceActivityId, hasDetailedData, hasStreams (in that order).
const fake = useFakeDb((q) => (/^select .* from "activities"/.test(q.sql) ? [['garmin', 'g-1', true, true]] : []))
afterAll(() => fake.restore())

const { PUT: connect } = await import('@/app/api/sources/[id]/connection/route')
const { POST: sync } = await import('@/app/api/sources/sync/route')
const { POST: history } = await import('@/app/api/sources/[id]/history/route')
const { POST: enrich } = await import('@/app/api/running/activity/[id]/enrich/route')
const { GET: exportData } = await import('@/app/api/account/export/route')

const T0 = Date.parse('2026-11-21T10:00:00Z')
const at = (ms: number) => vi.setSystemTime(T0 + ms)
const signIn = (password?: string) => connect(
  new Request('http://localhost/api/sources/garmin/connection', { method: 'PUT', body: JSON.stringify({ username: 'r@example.com', password, consent: true }) }),
  { params: Promise.resolve({ id: 'garmin' }) },
)
const page = (n: number) => history(new Request('http://localhost/api/sources/garmin/history', { method: 'POST', body: JSON.stringify({ page: n }) }), { params: Promise.resolve({ id: 'garmin' }) })
const reload = (force = true) => enrich(new Request(`http://localhost/api/running/activity/a1/enrich${force ? '?force=1' : ''}`, { method: 'POST' }), { params: Promise.resolve({ id: 'a1' }) })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(0)
  store.clear()
  garmin.contacts = 0
  Object.assign(work, { syncs: 0, pages: 0, enriched: 0, exports: 0 })
})
afterEach(() => { vi.useRealTimers() })

describe('Fenster (rein)', () => {
  const lim = { max: 2, windowMs: 1000 }
  it('zählt nur Ereignisse im Fenster und sagt, wann das nächste geht', () => {
    expect(recent('kaputt', 5000, lim)).toEqual([])
    expect(recent([3000, 4500, 4800, 'x', 9000], 5000, lim)).toEqual([4500, 4800])
    expect(retryAfter([4500], 5000, lim)).toBe(0)
    expect(retryAfter([4500, 4800], 5000, lim)).toBe(1)
    expect(retryAfter([4100, 4800], 4200, { max: 2, windowMs: 60_000 })).toBe(60)
  })
})

describe('Garmin verbinden: fehlgeschlagene Anmeldungen', () => {
  it('der sechste Fehlversuch in einer Stunde: 429 mit Retry-After, Garmin wird nicht gefragt', async () => {
    for (let i = 0; i < LIMITS.connectFailures.max; i++) {
      at(i * 60_000)
      expect((await signIn('falsch')).status).toBe(422)
    }
    expect(garmin.contacts).toBe(5)
    at(10 * 60_000)
    const res = await signIn('richtig')
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBe(50 * 60)     // the first failure leaves the window at 60 min
    expect((await res.json()).code).toBe('rate-limited')
    expect(garmin.contacts).toBe(5)
    at(60 * 60_000 + 1)                                                // an hour after the first: one attempt free again
    expect((await signIn('richtig')).status).toBe(200)
  })

  it('eine erfolgreiche Anmeldung setzt den Zähler zurück', async () => {
    for (let i = 0; i < 4; i++) await signIn('falsch')
    expect((await signIn('richtig')).status).toBe(200)
    for (let i = 0; i < 5; i++) expect((await signIn('falsch')).status).toBe(422)
    expect((await signIn('falsch')).status).toBe(429)
  })

  it('eine Anfrage ohne Passwort (kein Kontakt zu Garmin) zählt nicht', async () => {
    for (let i = 0; i < 8; i++) expect((await signIn(undefined)).status).toBe(400)
    expect((await signIn('richtig')).status).toBe(200)
  })

  it('pro Konto: ein anderes Konto ist nicht betroffen', async () => {
    for (let i = 0; i < 5; i++) await signIn('falsch')
    expect((await signIn('falsch')).status).toBe(429)
    expect([...store.keys()].every((k) => k.startsWith('user-t/throttle:'))).toBe(true)
  })
})

describe('Abkühlzeiten', () => {
  it('Sync: einmal pro Minute', async () => {
    expect((await sync()).status).toBe(200)
    const res = await sync()
    expect([res.status, res.headers.get('Retry-After')]).toEqual([429, '60'])
    at(60_001)
    expect((await sync()).status).toBe(200)
    expect(work.syncs).toBe(2)
  })

  it('Historie: der erste Import läuft durch alle Seiten; ein neuer Start erst nach fünf Minuten', async () => {
    for (let n = 0; n < 30; n++) expect((await page(n)).status, `Seite ${n}`).toBe(200)
    expect((await page(0)).status).toBe(429)
    at(5 * 60_000 + 1)
    expect((await page(0)).status).toBe(200)
    expect(work.pages).toBe(31)
  })

  it('Historie: höchstens 200 Seiten pro Stunde', async () => {
    store.set('user-t/throttle:history-pages', Array.from({ length: 200 }, (_, i) => T0 - 1000 + i))
    expect((await page(7)).status).toBe(429)
  })

  it('Detaildaten neu laden (force): alle 30 Sekunden; ohne force kein Limit', async () => {
    expect((await reload()).status).toBe(200)
    expect((await reload()).status).toBe(429)
    expect((await reload(false)).status).toBe(200)
    at(30_001)
    expect((await reload()).status).toBe(200)
    expect(work.enriched).toBe(2)
  })

  it('Export: alle zwei Minuten', async () => {
    expect((await exportData()).status).toBe(200)
    expect((await exportData()).status).toBe(429)
    at(2 * 60_000 + 1)
    expect((await exportData()).status).toBe(200)
    expect(work.exports).toBe(2)
  })
})
