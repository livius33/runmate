// 12-05 AC-2 and AC-3: no checkout while a subscription is live or one was started in the last 15 minutes; an event for
// another subscription id never replaces the stored one, is logged with both ids and is cancelled together with it
// (cancel button and account deletion). Mocked Paddle (fetch), pg-proxy fake DB.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { signCheckoutUser, signPaddle } from '@/lib/billing/paddle'
import { applyPaddleEvent, type PaddleEvent, type SubState } from '@/lib/billing/webhook'
import { checkoutBlock, CHECKOUT_LOCK_S } from '@/lib/billing/checkout'
import type { PriceIds } from '@/lib/billing/config'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-s' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const SECRET = 'pdl_ntfset_test_secret'
const IDS: PriceIds = { plus: { month: 'pri_pm', year: 'pri_py' } }
const env = { BILLING_ENABLED: '1', PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_API_KEY: 'pdl_sdbx_apikey_test', PADDLE_ENV: 'sandbox', PADDLE_PRICE_PLUS_MONTH: 'pri_pm', PADDLE_PRICE_PLUS_YEAR: 'pri_py', NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_tok' }
const T0 = 1_800_000_000
const END = T0 + 30 * 86_400
const iso = (s: number) => new Date(s * 1000).toISOString()

const db = { sub: null as Record<string, unknown> | null, claim: true }
const fake = useFakeDb((q) => {
  if (/^select .* from "subscription"/.test(q.sql) && db.sub) return [rowOf(subscription, db.sub)]
  if (/^update "subscription" set "checkout_started_at"/.test(q.sql)) return db.claim ? [[q.params[1]]] : []
  if (/^(insert into|update) "subscription"/.test(q.sql) && /returning/.test(q.sql)) return [[q.params[0]]]     // 12-05 compare-and-set: the write landed
  return []
})
afterAll(() => fake.restore())

const paddleCalls: { url: string; body: unknown }[] = []
beforeEach(() => {
  Object.assign(process.env, env)
  fake.log.length = 0
  paddleCalls.length = 0
  db.claim = true
  db.sub = { userId: 'user-s', status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: 'sub_1', paddleCustomerId: 'ctm_1', priceId: 'pri_pm', currentPeriodEnd: END, cancelAtPeriodEnd: false, eventAt: T0, updatedAt: 0, lastSeenAt: Math.floor(Date.now() / 1000) }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    paddleCalls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null })
    const id = String(url).split('/subscriptions/')[1]?.split('/')[0]
    return new Response(JSON.stringify({ data: { id, status: 'canceled', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], scheduled_change: null } }))
  }))
})
afterEach(() => { for (const k of Object.keys(env)) delete process.env[k as keyof typeof env]; vi.unstubAllGlobals() })

const sub = (id: string, at: number, data: Record<string, unknown> = {}, type = 'subscription.created'): PaddleEvent => ({
  event_id: `evt_${id}_${type}_${at}`, event_type: type, occurred_at: iso(at),
  data: { id, status: 'active', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], current_billing_period: { starts_at: iso(at), ends_at: iso(at + 30 * 86_400) }, scheduled_change: null, custom_data: { userId: 'user-s', userSig: signCheckoutUser('user-s', SECRET) }, ...data },
})
const LIVE: SubState = { status: 'active', tier: 'plus', interval: 'month', trialEndsAt: null, paddleCustomerId: 'ctm_1', paddleSubscriptionId: 'sub_1', priceId: 'pri_pm', currentPeriodEnd: END, cancelAtPeriodEnd: false, canceledAt: null, eventAt: T0, otherSubscriptionIds: null }

describe('Zweites Abo (rein)', () => {
  it('Ereignis für eine andere Abo-ID ersetzt die Zeile nicht; die zweite ID wird gemerkt', () => {
    const next = applyPaddleEvent(LIVE, sub('sub_2', T0 + 60, { items: [{ price: { id: 'pri_py' } }] }), IDS)!
    expect(next).toEqual({ ...LIVE, otherSubscriptionIds: ['sub_2'] })
    expect(applyPaddleEvent(next, sub('sub_2', T0 + 70, {}, 'subscription.updated'), IDS)).toBeNull()     // already known
  })

  it('das zweite Abo endet oder ist gekündigt: aus der Liste; das gespeicherte bleibt', () => {
    const row = { ...LIVE, otherSubscriptionIds: ['sub_2'] }
    expect(applyPaddleEvent(row, sub('sub_2', T0 + 80, { status: 'canceled' }, 'subscription.canceled'), IDS)).toEqual({ ...LIVE, otherSubscriptionIds: [] })
    expect(applyPaddleEvent(row, sub('sub_2', T0 + 80, { scheduled_change: { action: 'cancel', effective_at: iso(END) } }, 'subscription.updated'), IDS)).toEqual({ ...LIVE, otherSubscriptionIds: [] })
  })

  it('das gespeicherte Abo ist beendet: ein neues ersetzt es (erneuter Kauf nach Kündigung)', () => {
    const ended = { ...LIVE, status: 'canceled', otherSubscriptionIds: ['sub_2'] }
    expect(applyPaddleEvent(ended, sub('sub_2', T0 + 90, {}, 'subscription.updated'), IDS)).toMatchObject({ paddleSubscriptionId: 'sub_2', status: 'active', otherSubscriptionIds: [] })
  })
})

describe('Zweites Abo (Webhook, Kündigung, Löschung)', async () => {
  const { POST: webhook } = await import('@/app/api/billing/webhook/route')
  const { POST: cancel } = await import('@/app/api/billing/cancel/route')
  const { deleteAccount } = await import('@/lib/account/delete')
  const { runAsUser } = await import('@/lib/server/scope')

  it('Webhook: Zeile behält sub_1, sub_2 kommt dazu, Fehler-Log mit beiden IDs', async () => {
    db.sub = { ...db.sub, version: 3 }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const raw = JSON.stringify(sub('sub_2', T0 + 60))
      const res = await webhook(new Request('http://localhost/api/billing/webhook', { method: 'POST', body: raw, headers: { 'paddle-signature': signPaddle(raw, SECRET) } }))
      expect(await res.json()).toEqual({ ok: true, result: 'applied' })
      const ins = fake.log.find((q) => q.sql.startsWith('update "subscription"'))!
      expect(ins.params).toContain('sub_1')
      expect(ins.params).toContain(`{"sub_2"}`)                    // text[] as the driver sends it
      expect(ins.sql).toMatch(/"subscription"."version" = \$\d+/)   // compare-and-set on the version read
      expect(ins.params.slice(-2)).toEqual(['user-s', 3])
      const line = err.mock.calls.map((c) => c.map(String).join(' ')).find((l) => l.includes('second subscription'))!
      expect(line).toContain('sub_1')
      expect(line).toContain('sub_2')
      expect(line).toContain('user-s')
    } finally { err.mockRestore() }
  })

  it('„Jetzt kündigen“ kündigt beide', async () => {
    db.sub = { ...db.sub, otherSubscriptionIds: ['sub_2'] }
    const res = await cancel(new Request('http://localhost/api/billing/cancel', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(200)
    expect(paddleCalls.map((c) => c.url)).toEqual([
      'https://sandbox-api.paddle.com/subscriptions/sub_1/cancel',
      'https://sandbox-api.paddle.com/subscriptions/sub_2/cancel',
    ])
    expect(paddleCalls.every((c) => (c.body as { effective_from: string }).effective_from === 'next_billing_period')).toBe(true)
  })

  it('Kontolöschung kündigt beide sofort', async () => {
    db.sub = { ...db.sub, otherSubscriptionIds: ['sub_2'] }
    const r = await runAsUser('user-s', () => deleteAccount({ deleteClerkUser: false, strictBilling: true }), { profile: null })
    expect(r.ok).toBe(true)
    expect(paddleCalls.map((c) => [c.url.split('/subscriptions/')[1], (c.body as { effective_from: string }).effective_from])).toEqual([['sub_1/cancel', 'immediately'], ['sub_2/cancel', 'immediately']])
  })
})

describe('Checkout-Sperre', async () => {
  const { POST: checkout } = await import('@/app/api/billing/checkout/route')
  const { GET: info } = await import('@/app/api/billing/route')
  const claim = async () => { const r = await (checkout as unknown as () => Promise<Response>)(); return { status: r.status, body: await r.json() } }
  const free = { userId: 'user-s', status: 'trialing', trialEndsAt: 1, cancelAtPeriodEnd: false, updatedAt: 0, lastSeenAt: Math.floor(Date.now() / 1000) }

  it('rein: lebendes Abo, zweites Abo, Checkout vor weniger als 15 Minuten', () => {
    const now = T0
    expect(checkoutBlock(null, now)).toBeNull()
    expect(checkoutBlock({ status: 'active', paddleSubscriptionId: 'sub_1', otherSubscriptionIds: null, checkoutStartedAt: null }, now)).toBe('live')
    expect(checkoutBlock({ status: 'canceled', paddleSubscriptionId: 'sub_1', otherSubscriptionIds: ['sub_2'], checkoutStartedAt: null }, now)).toBe('live')
    expect(checkoutBlock({ status: 'canceled', paddleSubscriptionId: 'sub_1', otherSubscriptionIds: null, checkoutStartedAt: null }, now)).toBeNull()
    expect(checkoutBlock({ status: 'trialing', paddleSubscriptionId: null, otherSubscriptionIds: null, checkoutStartedAt: now - CHECKOUT_LOCK_S + 1 }, now)).toBe('pending')
    expect(checkoutBlock({ status: 'trialing', paddleSubscriptionId: null, otherSubscriptionIds: null, checkoutStartedAt: now - CHECKOUT_LOCK_S }, now)).toBeNull()
  })

  it('lebendes Abo: 409, keine Signatur, die Einstellungen zeigen die Sperre', async () => {
    expect(await claim()).toMatchObject({ status: 409, body: { block: 'live' } })
    expect((await claim()).body.userSig).toBeUndefined()
    const b = await (await (info as unknown as () => Promise<Response>)()).json()
    expect(b.checkoutBlocked).toBe('live')
    expect(b).not.toHaveProperty('userSig')
  })

  it('Checkout gerade begonnen: 409 pending', async () => {
    db.sub = { ...free, checkoutStartedAt: Math.floor(Date.now() / 1000) - 60 }
    expect(await claim()).toMatchObject({ status: 409, body: { block: 'pending' } })
    expect(fake.log.some((q) => q.sql.startsWith('update "subscription" set "checkout_started_at"'))).toBe(false)
  })

  it('kein Abo: Signatur ausgegeben, die Sperre ist eine bedingte Änderung in einer Anweisung', async () => {
    db.sub = free
    const r = await claim()
    expect(r).toEqual({ status: 200, body: { userId: 'user-s', userSig: signCheckoutUser('user-s', SECRET) } })
    const upd = fake.log.find((q) => q.sql.startsWith('update "subscription" set "checkout_started_at"'))!
    expect(upd.sql).toMatch(/"paddle_subscription_id" is null or "subscription"."status" = \$\d/)
    expect(upd.sql).toMatch(/cardinality\("subscription"."other_subscription_ids"\)/)
    expect(upd.sql).toMatch(/"checkout_started_at" is null or "subscription"."checkout_started_at" < \$\d/)
  })

  it('zwei Klicks gleichzeitig: der zweite verliert die bedingte Änderung → 409', async () => {
    db.sub = free
    db.claim = false                                       // the other request's UPDATE matched first
    expect(await claim()).toMatchObject({ status: 409, body: { block: 'pending' } })
  })

  it('ohne PADDLE_WEBHOOK_SECRET: keine Signatur, kein Checkout', async () => {
    db.sub = free
    delete process.env.PADDLE_WEBHOOK_SECRET
    expect(await claim()).toMatchObject({ status: 409, body: { block: 'not-configured' } })
  })
})
