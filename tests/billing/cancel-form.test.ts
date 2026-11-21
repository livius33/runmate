// 12-05 AC-1: the public cancellation form. First request cancels at period end and shows in the settings, where it can
// be taken back; a second request inside 24 hours reaches no Paddle; after a take-back requests are held for the owner.
// The HTTP answer is the same for every outcome and for unknown addresses. Mocked Paddle (fetch), pg-proxy fake DB.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { formDecision, parseFormState, FORM_HOLD_S } from '@/lib/billing/cancel-form'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-c' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: clerk.userId }),
  clerkClient: async () => ({ users: { getUserList: async ({ emailAddress }: { emailAddress: string[] }) => ({ data: emailAddress[0] === 'owner@example.com' ? [{ id: 'user-c' }] : [] }) } }),
}))

const env = { BILLING_ENABLED: '1', PADDLE_WEBHOOK_SECRET: 'whsec', PADDLE_API_KEY: 'pdl_sdbx_apikey_test', PADDLE_ENV: 'sandbox', PADDLE_PRICE_PLUS_MONTH: 'pri_pm', PADDLE_PRICE_PLUS_YEAR: 'pri_py', NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'test_tok' }
const T0 = 1_800_000_000
const END = T0 + 20 * 86_400
const iso = (s: number) => new Date(s * 1000).toISOString()

// Stateful fake: the settings rows (compare-and-set included) and one subscription row.
const store = { settings: new Map<string, string>(), sub: null as Record<string, unknown> | null }
const fake = useFakeDb((q) => {
  const p = q.params
  if (/^select "value" from "settings"/.test(q.sql)) return store.settings.has(String(p[1])) ? [[store.settings.get(String(p[1]))]] : []
  if (/^select "key", "value" from "settings"/.test(q.sql)) return [...store.settings].filter(([k]) => (p.slice(1) as string[]).includes(k))
  if (/^insert into "settings"/.test(q.sql)) {
    const [, key, value] = p as string[]
    if (/do nothing/.test(q.sql)) { if (store.settings.has(key)) return []; store.settings.set(key, value); return [[key]] }
    store.settings.set(key, value); return []
  }
  if (/^update "settings"/.test(q.sql)) {
    const [value, , key, expected] = p as string[]
    if (store.settings.get(key) !== expected) return []
    store.settings.set(key, value); return [[key]]
  }
  if (/^select .* from "subscription"/.test(q.sql) && store.sub) return [rowOf(subscription, store.sub)]
  if (/^update "subscription" set "status"/.test(q.sql) && store.sub) {
    // saveCancelled: the cancel flag is the only field these tests follow
    store.sub = { ...store.sub, cancelAtPeriodEnd: p.includes(true) }
    return []
  }
  return []
})
afterAll(() => fake.restore())

const paddleCalls: { url: string; method: string; body: unknown }[] = []
const paddleFails = { value: false }
const entity = (cancel: boolean) => ({ id: 'sub_1', status: 'active', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], current_billing_period: { starts_at: iso(T0), ends_at: iso(END) }, scheduled_change: cancel ? { action: 'cancel', effective_at: iso(END) } : null })
beforeEach(() => {
  Object.assign(process.env, env)
  fake.log.length = 0
  paddleCalls.length = 0
  paddleFails.value = false
  store.settings.clear()
  store.sub = { userId: 'user-c', status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: 'sub_1', paddleCustomerId: 'ctm_1', priceId: 'pri_pm', currentPeriodEnd: END, cancelAtPeriodEnd: false, eventAt: T0, updatedAt: 0, lastSeenAt: T0 }
  vi.useFakeTimers({ now: T0 * 1000, toFake: ['Date'] })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    paddleCalls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null })
    if (paddleFails.value) return new Response(JSON.stringify({ error: { code: 'internal_error' } }), { status: 500 })
    return new Response(JSON.stringify({ data: entity(String(url).endsWith('/cancel')) }))
  }))
})
afterEach(() => { for (const k of Object.keys(env)) delete process.env[k as keyof typeof env]; vi.unstubAllGlobals(); vi.useRealTimers() })

const { POST: formPost } = await import('@/app/api/billing/cancel-request/route')
const { POST: undoPost } = await import('@/app/api/billing/cancel/undo/route')
const { POST: heldPost } = await import('@/app/api/billing/cancel/held/route')
const { GET: billingGet } = await import('@/app/api/billing/route')

const form = (email = 'owner@example.com') => formPost(new Request('http://localhost/api/billing/cancel-request', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Erika Muster', email, kind: 'ordentlich' }),
}))
const answer = async (res: Response) => ({ status: res.status, body: await res.json() })
const cancels = () => paddleCalls.filter((c) => c.url.endsWith('/cancel'))
const advance = (s: number) => vi.setSystemTime(Date.now() + s * 1000)
const info = async () => (await (billingGet as unknown as () => Promise<Response>)()).json()

describe('Kündigungsformular (öffentlich)', () => {
  it('erste Anfrage: Kündigung zum Periodenende, in den Einstellungen sichtbar und zurücknehmbar', async () => {
    const res = await answer(await form())
    expect(res).toEqual({ status: 200, body: { ok: true, at: T0 } })
    expect(cancels()).toHaveLength(1)
    expect(cancels()[0].body).toEqual({ effective_from: 'next_billing_period' })
    expect(JSON.parse(store.settings.get('billing_cancellation')!)).toMatchObject({ viaForm: true, endsAt: END })

    const b = await info()
    expect(b.entitlements.cancelAtPeriodEnd).toBe(true)
    expect(b.cancellation).toEqual({ at: T0, endsAt: END, viaForm: true })

    const undo = await undoPost()
    expect(undo.status).toBe(200)
    const patch = paddleCalls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_1')
    expect(patch.body).toEqual({ scheduled_change: null })
    expect(store.sub!.cancelAtPeriodEnd).toBe(false)
    expect((await info()).cancellation).toBeNull()
  })

  it('zweite Anfrage innerhalb von 24 Stunden: kein Aufruf bei Paddle, gleiche Antwort', async () => {
    const first = await answer(await form())
    store.sub = { ...store.sub, cancelAtPeriodEnd: false }          // even if the first one was taken back meanwhile
    store.settings.delete('billing_cancellation')
    paddleCalls.length = 0
    advance(3600)
    const second = await answer(await form())
    expect(cancels()).toEqual([])
    expect(second.status).toBe(first.status)
    expect(Object.keys(second.body)).toEqual(Object.keys(first.body))
  })

  it('zwei Anfragen gleichzeitig: nur eine erreicht Paddle', async () => {
    await Promise.all([form(), form(), form()])
    expect(cancels()).toHaveLength(1)
  })

  it('nach einer Rücknahme: gespeichert, kein Aufruf bei Paddle; der Inhaber bestätigt oder verwirft', async () => {
    await form()
    await undoPost()
    paddleCalls.length = 0
    advance(2 * 86_400)
    const res = await answer(await form())
    expect(res.status).toBe(200)
    expect(cancels()).toEqual([])
    expect((await info()).heldRequests).toEqual([{ at: T0 + 2 * 86_400, kind: 'ordentlich' }])

    // discard
    const discard = await heldPost(new Request('http://localhost/api/billing/cancel/held', { method: 'POST', body: JSON.stringify({ action: 'discard' }) }))
    expect(discard.status).toBe(200)
    expect((await info()).heldRequests).toEqual([])
    expect(cancels()).toEqual([])

    // the next one a day later, confirmed
    advance(86_400 + 1)
    await form()
    expect(cancels()).toEqual([])
    const confirm = await heldPost(new Request('http://localhost/api/billing/cancel/held', { method: 'POST', body: JSON.stringify({ action: 'confirm' }) }))
    expect(confirm.status).toBe(200)
    expect(cancels()).toHaveLength(1)
    expect((await info()).heldRequests).toEqual([])
  })

  it('unbekannte Adresse: dieselbe Antwort, nichts gelesen oder geschrieben', async () => {
    const known = await answer(await form())
    fake.log.length = 0
    paddleCalls.length = 0
    const unknown = await answer(await form('nobody@example.com'))
    expect(unknown).toEqual(known)
    expect(fake.log).toEqual([])
    expect(paddleCalls).toEqual([])
  })

  it('die Logzeile nennt Nutzer und Abo, nie Adresse oder Name', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      await form()
      const line = info.mock.calls.map((c) => c.map(String).join(' ')).find((l) => l.includes('[billing/cancel-request]'))!
      expect(line).toContain('user-c')
      expect(line).toContain('sub_1')
      expect(line).not.toContain('owner@example.com')
      expect(line).not.toContain('Erika')
    } finally { info.mockRestore() }
  })

  it('Paddle-Fehler: 502, und der nächste Versuch wird nicht von der Sperre geschluckt', async () => {
    paddleFails.value = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await form()).status).toBe(502)
    } finally { err.mockRestore() }
    paddleFails.value = false
    paddleCalls.length = 0
    expect((await form()).status).toBe(200)
    expect(cancels()).toHaveLength(1)
  })
})

describe('Formular-Regeln (rein)', () => {
  const s = (o: object) => ({ ...parseFormState(null), ...o })
  it('Sperre 24 h, danach 90 Tage zurückhalten nach einer Rücknahme, danach wieder kündigen', () => {
    expect(formDecision(s({}), T0)).toBe('cancel')
    expect(formDecision(s({ lastAt: T0 - 86_399 }), T0)).toBe('cooldown')
    expect(formDecision(s({ lastAt: T0 - 86_400, undoneAt: T0 - 86_400 }), T0)).toBe('hold')
    expect(formDecision(s({ undoneAt: T0 - FORM_HOLD_S }), T0)).toBe('cancel')
  })
  it('kaputter Zustand zählt als leer', () => {
    expect(parseFormState('nope')).toEqual(parseFormState(null))
  })
})
