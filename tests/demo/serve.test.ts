// AC-7, AC-8, AC-9 (Phase 5): the demo serves only the demo user's rows, never asks Clerk and never sees the visitor's
// session; every write is refused before any SQL — also a write a GET handler attempts; routes off the allowlist and
// the whole demo without DEMO_MODE answer 404; the seed and the reset touch only demo rows.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ReadOnlyError } from '@/lib/scope'
import { DEMO_PROFILE, DEMO_USER_ID } from '@/lib/demo/athlete'
import { useFakeDb } from '../scope/fake-db'

// A signed-in real user is visiting the demo: Clerk would say so if anyone asked.
const clerk = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => { clerk.calls++; return { userId: 'user_REALREALREALREAL' } } }))

// One allowlisted GET that (wrongly) tries to write: the read-only scope must stop it.
vi.mock('@/app/api/season/route', async () => {
  const { withUser } = await import('@/lib/server/scope')
  const { setSetting } = await import('@/lib/db/settings')
  return { GET: withUser(async () => { await setSetting('season_goals', '{}'); return Response.json({ ok: true }) }) }
})

const fake = useFakeDb(() => [])
afterAll(() => fake.restore())
beforeEach(() => { process.env.DEMO_MODE = '1'; fake.log.length = 0; clerk.calls = 0 })
afterEach(() => { delete process.env.DEMO_MODE; delete process.env.CRON_SECRET })

const { GET, POST, PUT, PATCH, DELETE } = await import('@/app/demo/api/[...path]/route')
const { DEMO_API_ROUTES } = await import('@/lib/demo/routes')
const call = (path: string, method = 'GET', init: RequestInit = {}) => {
  const req = new Request(`http://localhost/demo/api/${path}`, { method, ...init })
  const ctx = { params: Promise.resolve({ path: path.split('?')[0].split('/') }) }
  const fn = { GET, POST, PUT, PATCH, DELETE }[method as 'GET']
  return fn(req, ctx)
}
const writes = () => fake.log.filter((q) => /^(insert|update|delete)/i.test(q.sql))
const userParams = () => fake.log.flatMap((q) => q.params).filter((p) => typeof p === 'string' && /^(user|demo-hamburg)/.test(p))

describe('Demo-API', () => {
  it('jede erlaubte Route liest nur Zeilen des Demo-Nutzers, ohne Clerk und ohne Schreiben', async () => {
    for (const p of DEMO_API_ROUTES) {
      const res = await call(p.replace('[id]', 'demo-2026-10-01'), 'GET', { headers: { cookie: '__session=real-session-token', authorization: 'Bearer x' } })
      if (p !== 'season') expect([200, 400, 404, 500], p).toContain(res.status)
    }
    expect(fake.log.length).toBeGreaterThan(20)
    expect(new Set(userParams())).toEqual(new Set([DEMO_USER_ID]))
    expect(writes()).toEqual([])
    expect(clerk.calls).toBe(0)
  })

  it('ein GET, der schreiben will: 403 „Demo – nur ansehen“, kein Schreibzugriff erreicht die Datenbank', async () => {
    const res = await call('season')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Demo – nur ansehen' })
    expect(writes()).toEqual([])
  })

  it('POST, PUT, PATCH, DELETE: 403 ohne jede Abfrage', async () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await call('running/plan-overrides', m, { body: '{}' })
      expect(res.status, m).toBe(403)
      expect((await res.json()).error).toBe('Demo – nur ansehen')
    }
    expect(fake.log).toEqual([])
  })

  it('nicht freigegebene Routen: 404 ohne Abfrage (Export, Konto, Abo, Links, Cron, Webhooks)', async () => {
    for (const p of ['account/export', 'account/delete', 'billing', 'calendar-link', 'health-link', 'cron/daily-sync', 'cron/demo-reset',
      'webhooks/clerk', 'consent/health', 'running/runs/x/y', '../account/export', 'running%2Fruns']) {
      expect((await call(p)).status, p).toBe(404)
    }
    expect(fake.log).toEqual([])
  })

  it('jede Route mit GET ist entweder freigegeben oder bewusst ausgeschlossen', () => {
    const EXCLUDED = ['account/export', 'billing', 'calendar-link', 'calendar/[token]', 'consent/health', 'cron/billing-reconcile', 'cron/daily-sync',
      'cron/demo-reset', 'cron/expired-accounts', 'health-link', 'onboarding', 'waitlist/confirm', 'waitlist/leave']
    const root = join(__dirname, '..', '..', 'app', 'api')
    const routes = (dir: string, prefix = ''): string[] => readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (!statSync(p).isDirectory()) return f === 'route.ts' ? [prefix.slice(1)] : []
      return routes(p, `${prefix}/${f}`)
    })
    const withGet = routes(root).filter((r) => /export (const|async function) GET/.test(require('node:fs').readFileSync(join(root, r, 'route.ts'), 'utf8')))
    expect(withGet.filter((r) => !DEMO_API_ROUTES.includes(r) && !EXCLUDED.includes(r))).toEqual([])
  })

  it('ohne DEMO_MODE: 404, keine Abfrage, auch für Schreibversuche', async () => {
    delete process.env.DEMO_MODE
    expect((await call('running/runs')).status).toBe(404)
    expect((await call('running/runs', 'POST')).status).toBe(404)
    expect(fake.log).toEqual([])
  })
})

describe('Schreibschutz im Demo-Scope', () => {
  it('insert, update, delete, execute werfen, bevor SQL entsteht', async () => {
    const { runAsDemo } = await import('@/lib/demo/serve')
    const { db } = await import('@/lib/db')
    const { settings } = await import('@/lib/db/schema')
    await expect(runAsDemo(async () => { await db.insert(settings).values({ userId: DEMO_USER_ID, key: 'k', value: 'v' }) })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(runAsDemo(async () => { await db.update(settings).set({ value: 'v' }) })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(runAsDemo(async () => { await db.delete(settings) })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(runAsDemo(async () => { await db.execute('select 1' as never) })).rejects.toBeInstanceOf(ReadOnlyError)
    expect(fake.log).toEqual([])
  })

  it('aus dem Demo-Scope führt kein Weg in einen beschreibbaren (auch nicht runAsUser für einen anderen Nutzer)', async () => {
    const { runAsDemo } = await import('@/lib/demo/serve')
    const { runAsUser } = await import('@/lib/server/scope')
    const { setSetting } = await import('@/lib/db/settings')
    await expect(runAsDemo(() => runAsUser('user_other', () => setSetting('k', 'v'), { profile: null }))).rejects.toBeInstanceOf(ReadOnlyError)
    expect(writes()).toEqual([])
  })

  it('der Demo-Scope bekommt alle Funktionen, ohne das Abo zu lesen', async () => {
    process.env.BILLING_ENABLED = '1'
    const { runAsDemo } = await import('@/lib/demo/serve')
    const { currentEntitlements } = await import('@/lib/billing/access')
    const e = await runAsDemo(currentEntitlements)
    expect(e.state).toBe('self-host')
    expect(fake.log).toEqual([])
    delete process.env.BILLING_ENABLED
  })
})

describe('Seed und nächtlicher Reset', async () => {
  const { builtInBlocks, registerBuiltInBlocks } = await import('@/lib/plan/blocks')
  const { runAsUser } = await import('@/lib/server/scope')
  const { resetDemo } = await import('@/lib/demo/store')
  const { GET: reset } = await import('@/app/api/cron/demo-reset/route')
  const saved = builtInBlocks()
  beforeEach(() => registerBuiltInBlocks([]))
  afterEach(() => registerBuiltInBlocks(saved))

  it('löscht und schreibt nur Zeilen des Demo-Nutzers', async () => {
    const counts = await runAsUser(DEMO_USER_ID, () => resetDemo('2026-11-02'), { profile: DEMO_PROFILE })
    expect(counts.activities).toBeGreaterThan(50)
    expect(writes().filter((q) => q.sql.startsWith('delete')).length).toBeGreaterThanOrEqual(12)
    for (const q of writes()) {
      const ids = q.params.filter((p) => typeof p === 'string' && /^(user|demo-hamburg)/.test(p))
      expect(ids.length, q.sql.slice(0, 60)).toBeGreaterThan(0)
      expect(new Set(ids), q.sql.slice(0, 60)).toEqual(new Set([DEMO_USER_ID]))
    }
  })

  it('verweigert jeden anderen Nutzer', async () => {
    await expect(runAsUser('user_other', () => resetDemo('2026-11-02'), { profile: null })).rejects.toThrow(/demo user/)
    expect(writes()).toEqual([])
  })

  it('Reset-Route: braucht CRON_SECRET und DEMO_MODE', async () => {
    process.env.CRON_SECRET = 'cron-test'
    const req = (auth: string) => new Request('http://localhost/api/cron/demo-reset', { headers: { authorization: auth } }) as never
    expect((await reset(req('Bearer nope'))).status).toBe(401)
    delete process.env.DEMO_MODE
    expect((await reset(req('Bearer cron-test'))).status).toBe(404)
    expect(fake.log).toEqual([])
  })
})
