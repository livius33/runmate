// 12-05 AC-4: account deletion when Paddle fails. The cancellation is tried again; if it still fails, subscription and
// customer id are logged and kept with the tombstone (for the reconcile job), never an e-mail address.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { deletedUsers } from '@/lib/db/public-schema'
import { getTableColumns } from 'drizzle-orm'
import { CANCEL_RETRY_MS } from '@/lib/account/delete'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-d' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const env = { BILLING_ENABLED: '1', PADDLE_WEBHOOK_SECRET: 'whsec', PADDLE_API_KEY: 'pdl_sdbx_apikey_test', PADDLE_ENV: 'sandbox', PADDLE_PRICE_PLUS_MONTH: 'pri_pm' }
const db = { sub: null as Record<string, unknown> | null }
const fake = useFakeDb((q) => {
  if (/^select .* from "subscription"/.test(q.sql) && db.sub) return [rowOf(subscription, db.sub)]
  if (/^(insert into|update) "subscription"/.test(q.sql) && /returning/.test(q.sql)) return [[q.params[0]]]     // 12-05 compare-and-set: the write landed
  return []
})
afterAll(() => fake.restore())

const fails = { left: 0 }
let calls = 0
const saved = [...CANCEL_RETRY_MS]
beforeEach(() => {
  Object.assign(process.env, env)
  fake.log.length = 0
  calls = 0
  CANCEL_RETRY_MS.splice(0, CANCEL_RETRY_MS.length, 1, 1)          // keep the test fast; the count is what matters
  db.sub = { userId: 'user-d', status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: 'sub_1', paddleCustomerId: 'ctm_1', priceId: 'pri_pm', currentPeriodEnd: 1, cancelAtPeriodEnd: false, eventAt: 1, updatedAt: 0 }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls++
    if (fails.left-- > 0) return new Response(JSON.stringify({ error: { code: 'internal_error' } }), { status: 500 })
    return new Response(JSON.stringify({ data: { id: String(url).split('/')[4], status: 'canceled', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }] } }))
  }))
})
afterEach(() => {
  for (const k of Object.keys(env)) delete process.env[k as keyof typeof env]
  vi.unstubAllGlobals()
  CANCEL_RETRY_MS.splice(0, CANCEL_RETRY_MS.length, ...saved)
})

const { deleteAccount } = await import('@/lib/account/delete')
const { runAsUser } = await import('@/lib/server/scope')
const del = (strictBilling: boolean) => runAsUser('user-d', () => deleteAccount({ deleteClerkUser: false, strictBilling }), { profile: null })
const tombstone = () => fake.log.find((q) => q.sql.startsWith('insert into "deleted_users"'))
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('Kontolöschung, wenn Paddle nicht kündigt', () => {
  it('zwei Fehlschläge, dann klappt es: dritter Versuch, Grabstein ohne Paddle-Kennungen', async () => {
    fails.left = 2
    const err = quiet()
    try {
      expect((await del(false)).ok).toBe(true)
    } finally { err.mockRestore() }
    expect(calls).toBe(3)
    expect(tombstone()!.params).not.toContain('sub_1')
    expect(tombstone()!.params).not.toContain('ctm_1')
  })

  it('bleibt der Fehler: Kennungen im Log und am Grabstein, die Daten sind trotzdem gelöscht', async () => {
    fails.left = 99
    const err = quiet()
    try {
      expect((await del(false)).ok).toBe(true)
      const line = err.mock.calls.map((c) => c.map(String).join(' ')).find((l) => l.includes('[account/delete]'))!
      expect(line).toContain('user-d')
      expect(line).toContain('sub_1')
      expect(line).toContain('ctm_1')
    } finally { err.mockRestore() }
    expect(calls).toBe(3)
    expect(tombstone()!.params).toEqual(expect.arrayContaining(['user-d', 'ctm_1', '{"sub_1"}']))
    expect(fake.log.some((q) => q.sql.startsWith('delete from "subscription"'))).toBe(true)
  })

  it('Löschen aus den Einstellungen (streng): nach den Versuchen nichts gelöscht, Fehlermeldung', async () => {
    fails.left = 99
    const err = quiet()
    try {
      const r = await del(true)
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining('nichts gelöscht') })
    } finally { err.mockRestore() }
    expect(calls).toBe(3)
    expect(fake.log.some((q) => q.sql.startsWith('delete'))).toBe(false)
    expect(tombstone()).toBeUndefined()
  })

  it('der Grabstein hat keine Spalte für eine E-Mail-Adresse', () => {
    expect(Object.keys(getTableColumns(deletedUsers)).sort()).toEqual(['deletedAt', 'paddleCustomerId', 'paddleSubscriptionIds', 'userId'])
  })
})
