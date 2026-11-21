// AC-4 … AC-8 (Phase 4) with a mocked Paddle: webhook signature, idempotency by event id, state transitions, the
// trial, cancellation at period end and the portal link. No network: fetch is stubbed, the DB is the pg-proxy fake.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billingEvents, subscription } from '@/lib/db/schema'
import { signPaddle, verifyPaddleSignature, SIGNATURE_TOLERANCE_S, signCheckoutUser } from '@/lib/billing/paddle'
import { applyPaddleEvent, type PaddleEvent, type SubState } from '@/lib/billing/webhook'
import { entitlements, planState } from '@/lib/billing/entitlements'
import type { PriceIds } from '@/lib/billing/config'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-p' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const SECRET = 'pdl_ntfset_test_secret'
const IDS: PriceIds = { plus: { month: 'pri_pm', year: 'pri_py' } }
const env = { BILLING_ENABLED: '1', PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_API_KEY: 'pdl_sdbx_apikey_test', PADDLE_ENV: 'sandbox', PADDLE_PRICE_PLUS_MONTH: 'pri_pm', PADDLE_PRICE_PLUS_YEAR: 'pri_py', NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_tok' }

const db = { sub: null as Record<string, unknown> | null, seen: new Set<string>() }
const fake = useFakeDb((q) => {
  if (/^select .* from "billing_events"/.test(q.sql)) return db.seen.has(String(q.params[0])) ? [[q.params[0]]] : []
  if (/^select .* from "subscription"/.test(q.sql) && db.sub) return [rowOf(subscription, db.sub)]
  if (/^insert into "subscription"/.test(q.sql) && /returning/.test(q.sql)) return [rowOf(subscription, { userId: q.params[0], status: 'trialing', trialEndsAt: q.params[2], cancelAtPeriodEnd: false, updatedAt: 0 })]
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { Object.assign(process.env, env); fake.log.length = 0; db.sub = null; db.seen.clear() })
afterEach(() => { for (const k of Object.keys(env)) delete process.env[k as keyof typeof env]; vi.unstubAllGlobals() })

const iso = (s: number) => new Date(s * 1000).toISOString()
const T0 = 1_800_000_000
const subEvent = (type: string, at: number, data: Partial<Record<string, unknown>> = {}, id = `evt_${type}_${at}`): PaddleEvent => ({
  event_id: id, event_type: type, occurred_at: iso(at),
  data: { id: 'sub_1', status: 'active', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], current_billing_period: { starts_at: iso(at), ends_at: iso(at + 30 * 86_400) }, scheduled_change: null, canceled_at: null, custom_data: { userId: 'user-p', userSig: signCheckoutUser('user-p', SECRET) }, ...data },
})

describe('Webhook-Signatur', () => {
  const body = '{"event_id":"evt_1"}'
  const now = 1_700_000_000

  it('gültig: ts + h1 über "ts:body"', () => {
    expect(verifyPaddleSignature(body, signPaddle(body, SECRET, now), SECRET, now)).toBe(true)
  })

  it('fehlt, falsches Geheimnis, anderer Body, zu alt, kaputt → abgelehnt', () => {
    expect(verifyPaddleSignature(body, null, SECRET, now)).toBe(false)
    expect(verifyPaddleSignature(body, signPaddle(body, SECRET, now), undefined, now)).toBe(false)
    expect(verifyPaddleSignature(body, signPaddle(body, 'other', now), SECRET, now)).toBe(false)
    expect(verifyPaddleSignature(body + ' ', signPaddle(body, SECRET, now), SECRET, now)).toBe(false)
    expect(verifyPaddleSignature(body, signPaddle(body, SECRET, now - SIGNATURE_TOLERANCE_S - 1), SECRET, now)).toBe(false)
    expect(verifyPaddleSignature(body, 'ts=abc;h1=zz', SECRET, now)).toBe(false)
    expect(verifyPaddleSignature(body, `ts=${now}`, SECRET, now)).toBe(false)
  })

  it('mehrere h1 (Geheimnis-Wechsel): eines passt genügt', () => {
    const good = signPaddle(body, SECRET, now).split(';')[1]
    expect(verifyPaddleSignature(body, `ts=${now};h1=${'0'.repeat(64)};${good}`, SECRET, now)).toBe(true)
  })
})

describe('Webhook-Route', async () => {
  const { POST } = await import('@/app/api/billing/webhook/route')
  const post = (ev: unknown, sign = true, raw = JSON.stringify(ev)) => POST(new Request('http://localhost/api/billing/webhook', {
    method: 'POST', body: raw, headers: sign ? { 'paddle-signature': signPaddle(raw, SECRET) } : {},
  }))
  const inserts = (table: string) => fake.log.filter((q) => q.sql.startsWith(`insert into "${table}"`))

  it('ohne gültige Signatur: 401, keine Datenbankabfrage', async () => {
    const res = await post(subEvent('subscription.created', T0), false)
    expect(res.status).toBe(401)
    expect(fake.log).toEqual([])
  })

  it('ohne BILLING_ENABLED: 404', async () => {
    delete process.env.BILLING_ENABLED
    expect((await post(subEvent('subscription.created', T0))).status).toBe(404)
  })

  it('subscription.created: Zeile für den Nutzer aus custom_data, Ereignis vermerkt', async () => {
    const res = await post(subEvent('subscription.created', T0))
    expect(await res.json()).toEqual({ ok: true, result: 'applied' })
    const [ins] = inserts('subscription')
    expect(ins.params).toContain('user-p')
    expect(ins.params).toContain('plus')
    expect(ins.params).toContain('sub_1')
    expect(inserts('billing_events')[0].params).toEqual(expect.arrayContaining(['evt_subscription.created_' + T0, 'user-p']))
  })

  it('dasselbe Ereignis zweimal: nur einmal geschrieben', async () => {
    const ev = subEvent('subscription.updated', T0)
    await post(ev)
    db.seen.add(ev.event_id)                                   // what the first delivery stored
    fake.log.length = 0
    expect(await (await post(ev)).json()).toEqual({ ok: true, result: 'duplicate' })
    expect(inserts('subscription')).toEqual([])
    expect(inserts('billing_events')).toEqual([])
  })

  it('custom_data ohne Signatur des Servers zählt nicht: fremde Nutzer-ID im Checkout schreibt nichts', async () => {
    const forged = [{ userId: 'user-victim' }, { userId: 'user-victim', userSig: signCheckoutUser('user-p', SECRET) }, { userId: 'user-victim', userSig: 'ab'.repeat(32) }]
    for (const [i, custom_data] of forged.entries()) {
      const res = await post(subEvent('subscription.created', T0, { id: 'sub_x', customer_id: 'ctm_x', custom_data }, `evt_forged_${i}`))
      expect(await res.json()).toEqual({ ok: true, result: 'unknown-user' })
    }
    expect(inserts('subscription')).toEqual([])
  })

  it('unbekannter Nutzer (kein custom_data, keine gespeicherte Kennung): 200, nichts geschrieben', async () => {
    const res = await post(subEvent('subscription.updated', T0, { custom_data: null }))
    expect(await res.json()).toEqual({ ok: true, result: 'unknown-user' })
    expect(inserts('subscription')).toEqual([])
  })

  it('andere Ereignistypen: bestätigt, ignoriert', async () => {
    expect(await (await post({ event_id: 'e', event_type: 'customer.updated', occurred_at: iso(T0), data: {} })).json()).toEqual({ ok: true, result: 'ignored' })
  })

  it('kaputter Body mit gültiger Signatur: 400', async () => {
    expect((await post(null, true, 'not json')).status).toBe(400)
  })
})

describe('Zustandsübergänge (rein)', () => {
  const step = (row: SubState | null, ev: PaddleEvent) => applyPaddleEvent(row, ev, IDS) ?? row
  const state = (row: SubState | null, now: number) => planState(row, now, true)

  it('created → past_due → updated (aktiv, Kündigung vorgemerkt) → canceled', () => {
    let row = step(null, subEvent('subscription.created', T0))
    expect(row).toMatchObject({ status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: 'sub_1', paddleCustomerId: 'ctm_1', currentPeriodEnd: T0 + 30 * 86_400 })
    expect(state(row, T0 + 1)).toBe('plus')

    row = step(row, subEvent('subscription.past_due', T0 + 31 * 86_400, { status: 'past_due' }))
    expect(state(row, T0 + 31 * 86_400)).toBe('past_due')
    expect(entitlements(row, T0 + 31 * 86_400, true).features.autoAdapt).toBe(true)     // Plus keeps its features while Paddle retries

    const end = T0 + 62 * 86_400
    row = step(row, subEvent('subscription.updated', T0 + 32 * 86_400, { status: 'active', current_billing_period: { starts_at: iso(T0 + 32 * 86_400), ends_at: iso(end) }, scheduled_change: { action: 'cancel', effective_at: iso(end) } }))
    expect(row).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: end })
    expect(state(row, end - 1)).toBe('plus')
    expect(state(row, end)).toBe('free')                                      // even if the canceled event is late

    row = step(row, subEvent('subscription.canceled', end, { status: 'canceled', canceled_at: iso(end), scheduled_change: null }))
    expect(row).toMatchObject({ status: 'canceled', canceledAt: end })
    expect(state(row, end + 1)).toBe('free')
    expect(entitlements(row, end + 1, true)).toMatchObject({ maxLivePlans: 1, features: { sync: true, plan: true, autoAdapt: false } })     // back to Free, not locked
  })

  it('ein älteres Ereignis überschreibt kein neueres', () => {
    const row = step(null, subEvent('subscription.canceled', T0 + 100, { status: 'canceled' }))
    expect(applyPaddleEvent(row, subEvent('subscription.updated', T0 + 50), IDS)).toBeNull()
  })

  it('Wechsel über das Portal: Plus monatlich → Plus jährlich', () => {
    const row = step(step(null, subEvent('subscription.created', T0)), subEvent('subscription.updated', T0 + 10, { items: [{ price: { id: 'pri_py' } }] }))
    expect(row).toMatchObject({ tier: 'plus', interval: 'year' })
  })

  it('unbekannte Preis-ID (auch die früheren Basic-Preise): keine Änderung', () => {
    expect(applyPaddleEvent(null, subEvent('subscription.created', T0, { items: [{ price: { id: 'pri_other' } }] }), IDS)).toBeNull()
    expect(applyPaddleEvent(null, subEvent('subscription.created', T0, { items: [{ price: { id: 'pri_bm' } }] }), IDS)).toBeNull()
  })

  it('transaction.completed vor dem Abo-Ereignis: verknüpft und aktiviert; danach nur noch die Kundenkennung', () => {
    const trial: SubState = { status: 'trialing', tier: null, interval: null, trialEndsAt: T0 + 86_400, paddleCustomerId: null, paddleSubscriptionId: null, priceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, eventAt: null, otherSubscriptionIds: null }
    const tx = { event_id: 'txn', event_type: 'transaction.completed', occurred_at: iso(T0), data: { subscription_id: 'sub_9', customer_id: 'ctm_9', items: [{ price: { id: 'pri_py' } }] } }
    const row = applyPaddleEvent(trial, tx, IDS)
    expect(row).toMatchObject({ status: 'active', tier: 'plus', interval: 'year', paddleSubscriptionId: 'sub_9', trialEndsAt: T0 + 86_400 })
    expect(applyPaddleEvent(row, tx, IDS)).toBeNull()
    expect(applyPaddleEvent(trial, { ...tx, data: { customer_id: 'ctm_9' } }, IDS)).toBeNull()     // no subscription: one-off
  })

  it('nach der Kündigung lebt die Testphase nicht wieder auf', () => {
    const trialRow: SubState = { status: 'trialing', tier: null, interval: null, trialEndsAt: T0 + 20 * 86_400, paddleCustomerId: null, paddleSubscriptionId: null, priceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, eventAt: null, otherSubscriptionIds: null }
    const row = step(trialRow, subEvent('subscription.canceled', T0 + 86_400, { status: 'canceled' }))
    expect(state(row, T0 + 2 * 86_400)).toBe('free')
  })
})

describe('Testphase beim ersten Anmelden', async () => {
  const { ensureSubscription } = await import('@/lib/billing/access')
  const { runAsUser } = await import('@/lib/server/scope')

  it('Billing an, noch keine Zeile: Testphase über 30 Tage, ohne Zahlungsdaten', async () => {
    const before = Math.floor(Date.now() / 1000)
    const row = await runAsUser('user-p', ensureSubscription, { profile: null })
    const ins = fake.log.find((q) => q.sql.startsWith('insert into "subscription"'))!
    expect(ins.params[0]).toBe('user-p')
    expect(ins.params).toContain('trialing')
    const ends = Number(row!.trialEndsAt)
    expect(ends - before).toBeGreaterThanOrEqual(30 * 86_400)
    expect(ends - before).toBeLessThan(30 * 86_400 + 5)
  })

  it('Zeile vorhanden: nichts geschrieben', async () => {
    db.sub = { userId: 'user-p', status: 'active', tier: 'plus', cancelAtPeriodEnd: false, updatedAt: 0 }
    await runAsUser('user-p', ensureSubscription, { profile: null })
    expect(fake.log.some((q) => q.sql.startsWith('insert'))).toBe(false)
  })

  it('Billing aus: keine Abfrage, kein Abo', async () => {
    delete process.env.BILLING_ENABLED
    expect(await runAsUser('user-p', ensureSubscription, { profile: null })).toBeNull()
    expect(fake.log).toEqual([])
  })
})

// AC-5 (Phase 9): the settings card gets exactly the configured Plus prices, nothing else.
describe('Angebot für die Einstellungen (/api/billing)', async () => {
  const { GET } = await import('@/app/api/billing/route')
  const info = async () => (await (GET as unknown as () => Promise<Response>)()).json()

  it('beide Preise gesetzt: Plus monatlich und jährlich, mit 9 € und 79 €', async () => {
    db.sub = { userId: 'user-p', status: 'trialing', trialEndsAt: 1, cancelAtPeriodEnd: false, updatedAt: 0 }
    const b = await info()
    expect(b.checkout.prices).toEqual([
      { tier: 'plus', interval: 'month', priceId: 'pri_pm', label: '9 € / Monat' },
      { tier: 'plus', interval: 'year', priceId: 'pri_py', label: '79 € / Jahr' },
    ])
    expect(b.entitlements.state).toBe('free')
  })

  it('nur der Monatspreis gesetzt; frühere Basic-Variablen zählen nicht', async () => {
    delete process.env.PADDLE_PRICE_PLUS_YEAR
    process.env.PADDLE_PRICE_BASIC_MONTH = 'pri_bm'
    try {
      const b = await info()
      expect(b.checkout.prices).toEqual([{ tier: 'plus', interval: 'month', priceId: 'pri_pm', label: '9 € / Monat' }])
    } finally {
      delete process.env.PADDLE_PRICE_BASIC_MONTH
    }
  })

  it('Billing aus: kein Angebot', async () => {
    delete process.env.BILLING_ENABLED
    const b = await info()
    expect(b).toMatchObject({ billing: false, checkout: null, subscription: null })
  })
})

describe('Kündigungsbutton und Kundenportal', async () => {
  const { POST: cancel } = await import('@/app/api/billing/cancel/route')
  const { POST: portal } = await import('@/app/api/billing/portal/route')
  const paddleCalls: { url: string; init: RequestInit }[] = []
  const stubPaddle = (data: unknown, status = 200) => {
    paddleCalls.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      paddleCalls.push({ url, init })
      return new Response(JSON.stringify(status < 300 ? { data } : { error: { code: 'not_found', detail: 'secret detail' } }), { status })
    }))
  }
  const end = T0 + 30 * 86_400
  beforeEach(() => { db.sub = { userId: 'user-p', status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: 'sub_1', paddleCustomerId: 'ctm_1', priceId: 'pri_pm', currentPeriodEnd: end, cancelAtPeriodEnd: false, eventAt: T0, updatedAt: 0 } })
  const req = (body: unknown) => new Request('http://localhost/api/billing/cancel', { method: 'POST', body: JSON.stringify(body) })

  it('„Jetzt kündigen“: Paddle kündigt zum Periodenende, Zeile und Kündigungsvermerk gespeichert', async () => {
    stubPaddle({ id: 'sub_1', status: 'active', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], current_billing_period: { starts_at: iso(T0), ends_at: iso(end) }, scheduled_change: { action: 'cancel', effective_at: iso(end) } })
    const res = await cancel(req({ kind: 'ordentlich' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, kind: 'subscription', endsAt: end, cancellation: 'ordentlich' })
    expect(paddleCalls).toHaveLength(1)
    expect(paddleCalls[0].url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_1/cancel')
    expect(JSON.parse(String(paddleCalls[0].init.body))).toEqual({ effective_from: 'next_billing_period' })
    expect((paddleCalls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer pdl_sdbx_apikey_test')
    const upd = fake.log.find((q) => q.sql.startsWith('update "subscription"'))!
    expect(upd.params).toContain(true)                                   // cancel_at_period_end
    expect(fake.log.some((q) => q.sql.startsWith('insert into "settings"') && q.params.includes('billing_cancellation'))).toBe(true)
  })

  it('Paddle-Fehler: 502 mit deutscher Meldung, ohne Paddle-Details', async () => {
    stubPaddle(null, 404)
    const res = await cancel(req({}))
    expect(res.status).toBe(502)
    const body = await res.text()
    expect(body).toContain('Kündigung')
    expect(body).not.toContain('secret detail')
  })

  it('in der Testphase ohne Paddle-Abo: nichts bei Paddle, Hinweis auf das Ende', async () => {
    db.sub = { userId: 'user-p', status: 'trialing', trialEndsAt: end, cancelAtPeriodEnd: false, updatedAt: 0 }
    stubPaddle({})
    expect(await (await cancel(req({}))).json()).toMatchObject({ ok: true, kind: 'trial', endsAt: end })
    expect(paddleCalls).toEqual([])
  })

  it('Kundenportal: frischer Link für Kunde und Abo', async () => {
    stubPaddle({ urls: { general: { overview: 'https://customer-portal.paddle.com/cpl_1' } } })
    const res = await portal()
    expect(await res.json()).toEqual({ url: 'https://customer-portal.paddle.com/cpl_1' })
    expect(paddleCalls[0].url).toBe('https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions')
    expect(JSON.parse(String(paddleCalls[0].init.body))).toEqual({ subscription_ids: ['sub_1'] })
  })
})

// The table list is part of the idempotency contract: event ids are stored with their user.
it('billing_events: Ereignis-ID ist der Primärschlüssel', () => {
  expect(billingEvents.eventId.primary).toBe(true)
})
