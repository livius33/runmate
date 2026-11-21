// 12-05 AC-5 and AC-6: checkout only with every Paddle setting in place (one log line otherwise); unknown-user webhook
// events logged at error level with event and subscription id; the daily job compares every non-final row with Paddle
// and applies the difference. Mocked Paddle (fetch), pg-proxy fake DB.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { billingProblems, billingReady, logBillingConfig, type PriceIds } from '@/lib/billing/config'
import { signPaddle, type PaddleSubscription } from '@/lib/billing/paddle'
import { reconcileState, RECONCILE_PAGE } from '@/lib/billing/reconcile'
import type { SubState } from '@/lib/billing/webhook'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-r' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const SECRET = 'pdl_ntfset_test_secret'
const IDS: PriceIds = { plus: { month: 'pri_pm', year: 'pri_py' } }
const env = { BILLING_ENABLED: '1', PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_API_KEY: 'pdl_sdbx_apikey_test', PADDLE_ENV: 'sandbox', PADDLE_PRICE_PLUS_MONTH: 'pri_pm', PADDLE_PRICE_PLUS_YEAR: 'pri_py', NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_tok', CRON_SECRET: 'cron' }
const T0 = 1_800_000_000
const END = T0 + 30 * 86_400
const iso = (s: number) => new Date(s * 1000).toISOString()

// tombs: deleted user id → Paddle ids still to cancel (the deleted_users table, stateful).
const db = { sub: null as Record<string, unknown> | null, rows: [] as Record<string, unknown>[], tombs: new Map<string, { ids: string[] | null; customer: string | null }>() }
const fake = useFakeDb((q) => {
  if (/^select .* from "subscription" where \(\(\("subscription"."paddle_subscription_id" is not null/.test(q.sql)) {
    const after = String(q.params[q.params.length - 2])
    const limit = Number(q.params[q.params.length - 1])
    return db.rows.filter((r) => String(r.userId) > after).slice(0, limit).map((r) => rowOf(subscription, r))
  }
  if (/^select .* from "subscription"/.test(q.sql) && db.sub) return [rowOf(subscription, db.sub)]
  if (/^select "user_id" from "deleted_users" where "deleted_users"."user_id" = \$1/.test(q.sql)) return db.tombs.has(String(q.params[0])) ? [[q.params[0]]] : []
  if (/^select "user_id", "paddle_subscription_ids" from "deleted_users"/.test(q.sql)) return [...db.tombs].filter(([, t]) => t.ids?.length).map(([u, t]) => [u, t.ids])
  if (/^update "deleted_users" set "paddle_customer_id" = coalesce/.test(q.sql)) {        // keepOnTombstone: append once
    const [customer, id, user] = q.params as string[]
    const t = db.tombs.get(user)
    if (!t || t.ids?.includes(id)) return []
    db.tombs.set(user, { ids: [...(t.ids ?? []), id], customer: t.customer ?? customer })
    return [[user]]
  }
  if (/^update "deleted_users" set "paddle_subscription_ids" = nullif\(array_remove/.test(q.sql)) {
    const [id, user] = q.params as string[]
    const t = db.tombs.get(user)
    if (t) { const left = (t.ids ?? []).filter((x) => x !== id); db.tombs.set(user, { ...t, ids: left.length ? left : null }) }
    return []
  }
  if (/^select .* from "subscription" where "subscription"."user_id" = \$1/.test(q.sql)) {
    const r = db.rows.find((x) => x.userId === q.params[0])
    return r ? [rowOf(subscription, r)] : []
  }
  if (/^(insert into|update) "subscription"/.test(q.sql) && /returning/.test(q.sql)) return [[q.params[0]]]     // 12-05 compare-and-set: the write landed
  return []
})
afterAll(() => fake.restore())

const paddle = { byId: {} as Record<string, Partial<PaddleSubscription>>, calls: [] as string[] }
beforeEach(() => {
  Object.assign(process.env, env)
  fake.log.length = 0
  db.sub = null
  db.rows = []
  db.tombs.clear()
  paddle.byId = {}
  paddle.calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = String(url).replace('https://sandbox-api.paddle.com', '')
    paddle.calls.push(`${init.method} ${path}`)
    const id = path.split('/')[2]
    const s = paddle.byId[id]
    if (!s) return new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 })
    return new Response(JSON.stringify({ data: { id, customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], ...s, ...(path.endsWith('/cancel') ? { status: 'canceled' } : {}) } }))
  }))
})
afterEach(() => { for (const k of Object.keys(env)) delete process.env[k as keyof typeof env]; vi.unstubAllGlobals() })

describe('Billing bereit (AC-5)', () => {
  it('alles gesetzt: bereit, keine Logzeile', () => {
    expect(billingReady()).toBe(true)
    expect(logBillingConfig(() => {})).toBeNull()
  })

  it.each([
    ['PADDLE_WEBHOOK_SECRET'], ['PADDLE_API_KEY'], ['NEXT_PUBLIC_PADDLE_CLIENT_TOKEN'], ['PADDLE_ENV'],
  ])('ohne %s: nicht bereit, eine Zeile nennt den Namen, nie einen Wert', (name) => {
    delete process.env[name]
    expect(billingReady()).toBe(false)
    const lines: string[] = []
    logBillingConfig((l) => lines.push(l))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(name)
    expect(lines[0]).not.toContain(SECRET)
    expect(lines[0]).not.toContain('pdl_sdbx_apikey_test')
  })

  it('PADDLE_ENV nur exakt sandbox oder production', () => {
    for (const v of ['prod', 'Production', 'live', ' sandbox', '']) {
      process.env.PADDLE_ENV = v
      expect(billingReady()).toBe(false)
    }
    process.env.PADDLE_ENV = 'production'
    expect(billingReady()).toBe(true)
  })

  it('kein Preis: nicht bereit; ein Preis genügt', () => {
    delete process.env.PADDLE_PRICE_PLUS_YEAR
    expect(billingReady()).toBe(true)
    delete process.env.PADDLE_PRICE_PLUS_MONTH
    expect(billingProblems()).toEqual(['PADDLE_PRICE_PLUS_MONTH or PADDLE_PRICE_PLUS_YEAR'])
  })

  it('nicht bereit: kein Angebot in den Einstellungen, kein Checkout, kein Aufruf bei Paddle', async () => {
    const { GET } = await import('@/app/api/billing/route')
    const { POST: checkout } = await import('@/app/api/billing/checkout/route')
    const { POST: cancel } = await import('@/app/api/billing/cancel/route')
    process.env.PADDLE_ENV = 'prod'
    db.sub = { userId: 'user-r', status: 'active', tier: 'plus', paddleSubscriptionId: 'sub_1', cancelAtPeriodEnd: false, updatedAt: 0, lastSeenAt: Math.floor(Date.now() / 1000) }
    expect((await (await (GET as unknown as () => Promise<Response>)()).json()).checkout).toBeNull()
    expect(await (await (checkout as unknown as () => Promise<Response>)()).json()).toMatchObject({ block: 'not-configured' })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await cancel(new Request('http://localhost/api/billing/cancel', { method: 'POST', body: '{}' }))).status).toBe(502)
    } finally { err.mockRestore() }
    expect(paddle.calls).toEqual([])                       // a wrong PADDLE_ENV never reaches the sandbox by accident
  })
})

describe('Webhook ohne bekannten Nutzer (AC-6)', () => {
  it('Fehler-Log mit Ereignis- und Abo-ID', async () => {
    const { POST } = await import('@/app/api/billing/webhook/route')
    const ev = { event_id: 'evt_orphan', event_type: 'subscription.created', occurred_at: iso(T0), data: { id: 'sub_orphan', status: 'active', customer_id: 'ctm_orphan', custom_data: null } }
    const raw = JSON.stringify(ev)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const res = await POST(new Request('http://localhost/api/billing/webhook', { method: 'POST', body: raw, headers: { 'paddle-signature': signPaddle(raw, SECRET) } }))
      expect(await res.json()).toEqual({ ok: true, result: 'unknown-user' })
      const line = err.mock.calls.map((c) => c.map(String).join(' ')).find((l) => l.includes('without a known user'))!
      expect(line).toContain('evt_orphan')
      expect(line).toContain('sub_orphan')
      expect(warn).not.toHaveBeenCalled()
    } finally { err.mockRestore(); warn.mockRestore() }
  })
})

describe('Abgleich mit Paddle (rein)', () => {
  const row: SubState = { status: 'active', tier: 'plus', interval: 'month', trialEndsAt: null, paddleCustomerId: 'ctm_1', paddleSubscriptionId: 'sub_1', priceId: 'pri_pm', currentPeriodEnd: END, cancelAtPeriodEnd: false, canceledAt: null, eventAt: T0, otherSubscriptionIds: null, otherSubscriptionSeen: null }
  const entity = (o: Partial<PaddleSubscription> = {}): PaddleSubscription => ({ id: 'sub_1', status: 'active', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], current_billing_period: { starts_at: iso(T0), ends_at: iso(END) }, scheduled_change: null, updated_at: iso(T0 + 10), ...o })

  it('gleich: nichts zu tun', () => {
    expect(reconcileState(row, entity(), {}, IDS)).toBeNull()
  })

  it('verpasstes Ereignis: Kündigung vorgemerkt bzw. beendet wird übernommen', () => {
    expect(reconcileState(row, entity({ scheduled_change: { action: 'cancel', effective_at: iso(END) } }), {}, IDS)).toMatchObject({ cancelAtPeriodEnd: true, eventAt: T0 + 10 })
    expect(reconcileState(row, entity({ status: 'canceled', canceled_at: iso(T0 + 5) }), {}, IDS)).toMatchObject({ status: 'canceled', canceledAt: T0 + 5 })
  })

  it('der Webhook war neuer als Paddles Stand: bleibt', () => {
    expect(reconcileState({ ...row, eventAt: T0 + 100 }, entity({ status: 'past_due' }), {}, IDS)).toBeNull()
  })

  it('zweites Abo beendet: aus der Liste; gespeichertes beendet, zweites läuft: das zweite übernimmt', () => {
    const two = { ...row, otherSubscriptionIds: ['sub_2'] }
    expect(reconcileState(two, entity(), { sub_2: entity({ id: 'sub_2', status: 'canceled' }) }, IDS)).toMatchObject({ paddleSubscriptionId: 'sub_1', otherSubscriptionIds: [] })
    expect(reconcileState(two, entity({ status: 'canceled' }), { sub_2: entity({ id: 'sub_2', items: [{ price: { id: 'pri_py' } }] }) }, IDS))
      .toMatchObject({ paddleSubscriptionId: 'sub_2', status: 'active', interval: 'year', otherSubscriptionIds: [] })
  })
})

describe('Täglicher Abgleich (Cron)', async () => {
  const { GET } = await import('@/app/api/cron/billing-reconcile/route')
  const run = async (auth = 'Bearer cron') => {
    const { NextRequest } = await import('next/server')
    return GET(new NextRequest('http://localhost/api/cron/billing-reconcile', { headers: { authorization: auth } }))
  }
  const live = (n: number) => ({ userId: `user-${String(n).padStart(4, '0')}`, status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: `sub_${n}`, paddleCustomerId: 'ctm_1', priceId: 'pri_pm', currentPeriodEnd: END, cancelAtPeriodEnd: false, eventAt: T0, updatedAt: 0 })

  it('ohne oder mit falschem CRON_SECRET: 401', async () => {
    expect((await run('')).status).toBe(401)
    expect((await run('Bearer nope')).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await run()).status).toBe(401)
  })

  it('blättert seitenweise durch alle Zeilen, schreibt nur die abweichenden, kündigt Übriggebliebenes am Grabstein', async () => {
    const n = RECONCILE_PAGE + 5
    db.rows = Array.from({ length: n }, (_, i) => live(i))
    for (let i = 0; i < n; i++) paddle.byId[`sub_${i}`] = { status: 'active', current_billing_period: { starts_at: iso(T0), ends_at: iso(END) }, scheduled_change: null, updated_at: iso(T0 + 10) }
    paddle.byId.sub_7 = { ...paddle.byId.sub_7, scheduled_change: { action: 'cancel', effective_at: iso(END) } }     // missed webhook
    db.tombs.set('user-gone', { ids: ['sub_gone'], customer: 'ctm_gone' })
    paddle.byId.sub_gone = { status: 'active' }
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const res = await run()
      expect(await res.json()).toEqual({ ok: true, rows: n, changed: 1, failed: 0, tombstones: 1, cancelled: 1, complete: true })
    } finally { info.mockRestore() }
    const pages = fake.log.filter((q) => /^select .* from "subscription" where \(\(\("subscription"."paddle_subscription_id" is not null/.test(q.sql))
    expect(pages).toHaveLength(2)
    expect(pages[1].params).toContain(`user-${String(RECONCILE_PAGE - 1).padStart(4, '0')}`)       // keyset: after the last id of page 1
    const updates = fake.log.filter((q) => q.sql.startsWith('update "subscription"'))
    expect(updates).toHaveLength(1)
    expect(updates[0].params).toContain('user-0007')
    expect(paddle.calls).toContain('POST /subscriptions/sub_gone/cancel')
    expect(db.tombs.get('user-gone')).toEqual({ ids: null, customer: 'ctm_gone' })
  })

  // 12-05 review 1: a subscription bought during or after the deletion.
  it('Abo für ein gelöschtes Konto: ID an den Grabstein (einmal), Fehler-Log, der Abgleich kündigt es', async () => {
    const { POST: webhook } = await import('@/app/api/billing/webhook/route')
    const { signCheckoutUser } = await import('@/lib/billing/paddle')
    db.tombs.set('user-gone', { ids: null, customer: null })
    const post = (id: string, data: Record<string, unknown>) => {
      const raw = JSON.stringify({ event_id: id, event_type: 'subscription.created', occurred_at: iso(T0), data: { id: 'sub_late', status: 'active', customer_id: 'ctm_late', items: [{ price: { id: 'pri_pm' } }], custom_data: { userId: 'user-gone', userSig: signCheckoutUser('user-gone', SECRET) }, ...data } })
      return webhook(new Request('http://localhost/api/billing/webhook', { method: 'POST', body: raw, headers: { 'paddle-signature': signPaddle(raw, SECRET) } }))
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      expect(await (await post('evt_late_1', {})).json()).toEqual({ ok: true, result: 'deleted-user' })
      expect(await (await post('evt_late_2', {})).json()).toEqual({ ok: true, result: 'deleted-user' })        // a second event: still once
      await post('evt_late_3', { id: 'sub_old', status: 'canceled' })                                             // an ended one is not kept
      expect(db.tombs.get('user-gone')).toEqual({ ids: ['sub_late'], customer: 'ctm_late' })
      const lines = err.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => l.includes('deleted user'))
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('user-gone')
      expect(lines[0]).toContain('sub_late')
      expect(fake.log.some((q) => /^(insert|update) "subscription"/.test(q.sql) || q.sql.startsWith('insert into "billing_events"'))).toBe(false)

      paddle.byId.sub_late = { status: 'active' }
      expect(await (await run()).json()).toMatchObject({ tombstones: 1, cancelled: 1, complete: true })
    } finally { err.mockRestore(); info.mockRestore() }
    expect(paddle.calls).toContain('POST /subscriptions/sub_late/cancel')
    expect(db.tombs.get('user-gone')!.ids).toBeNull()
  })

  it('Billing aus: nichts gelesen', async () => {
    delete process.env.BILLING_ENABLED
    expect(await (await run()).json()).toEqual({ ok: true, billing: false })
    expect(fake.log).toEqual([])
  })
})
