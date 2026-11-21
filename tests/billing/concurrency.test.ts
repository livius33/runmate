// 12-05 AC-7: the webhook's read-modify-write and the go-live of a draft hold against two requests at once. Both are a
// compare-and-set in one statement (no transactions on neon-http): the fake DB below lets the other request win in
// between and checks that the loser reads again instead of overwriting.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { signCheckoutUser, signPaddle } from '@/lib/billing/paddle'
import type { LiveEntry } from '@/lib/plan/live-blocks'
import type { TrainingBlock } from '@/lib/plan/types'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-k' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const SECRET = 'pdl_ntfset_test_secret'
const env = { BILLING_ENABLED: '1', PADDLE_WEBHOOK_SECRET: SECRET, PADDLE_API_KEY: 'k', PADDLE_ENV: 'sandbox', PADDLE_PRICE_PLUS_MONTH: 'pri_pm' }
const T0 = 1_800_000_000
const iso = (s: number) => new Date(s * 1000).toISOString()

// The subscription row with a version, and a hook that runs "the other request" right before our write is checked.
const st = { sub: null as Record<string, unknown> | null, before: null as null | (() => void), settings: new Map<string, string>(), beforeSetting: null as null | (() => void) }
const fake = useFakeDb((q) => {
  const p = q.params
  if (/^select .* from "billing_events"/.test(q.sql) || /^select .* from "deleted_users"/.test(q.sql)) return []
  if (/^select .* from "subscription"/.test(q.sql)) return st.sub ? [rowOf(subscription, st.sub)] : []
  if (/^update "subscription"/.test(q.sql) && /returning/.test(q.sql)) {
    if (st.before) { const f = st.before; st.before = null; f() }
    const expected = p[p.length - 1]
    if (!st.sub || st.sub.version !== expected) return []
    st.sub = { ...st.sub, status: p[0], cancelAtPeriodEnd: p.includes(true), version: (st.sub.version as number) + 1 }
    return [[st.sub.userId]]
  }
  if (/^select "value" from "settings"/.test(q.sql)) return st.settings.has(String(p[1])) ? [[st.settings.get(String(p[1]))]] : []
  if (/^insert into "settings"/.test(q.sql) && /do nothing/.test(q.sql)) {
    if (st.beforeSetting) { const f = st.beforeSetting; st.beforeSetting = null; f() }
    const [, key, value] = p as string[]
    if (st.settings.has(key)) return []
    st.settings.set(key, value)
    return [[key]]
  }
  if (/^update "settings"/.test(q.sql)) {
    if (st.beforeSetting) { const f = st.beforeSetting; st.beforeSetting = null; f() }
    const [value, , key, expected] = p as string[]
    if (st.settings.get(key) !== expected) return []
    st.settings.set(key, value)
    return [[key]]
  }
  return []
})
afterAll(() => fake.restore())
beforeEach(() => {
  Object.assign(process.env, env)
  fake.log.length = 0
  st.before = null
  st.beforeSetting = null
  st.settings.clear()
  st.sub = { userId: 'user-k', status: 'active', tier: 'plus', interval: 'month', paddleSubscriptionId: 'sub_1', paddleCustomerId: 'ctm_1', priceId: 'pri_pm', currentPeriodEnd: T0 + 30 * 86_400, cancelAtPeriodEnd: false, eventAt: T0, updatedAt: 0, version: 4 }
})
afterEach(() => { for (const k of Object.keys(env)) delete process.env[k as keyof typeof env] })

describe('Webhook: lesen, ändern, schreiben ohne Sperre', async () => {
  const { POST } = await import('@/app/api/billing/webhook/route')
  const post = (at: number, data: Record<string, unknown>) => {
    const raw = JSON.stringify({ event_id: `evt_${at}`, event_type: 'subscription.updated', occurred_at: iso(at),
      data: { id: 'sub_1', status: 'active', customer_id: 'ctm_1', items: [{ price: { id: 'pri_pm' } }], scheduled_change: null, custom_data: { userId: 'user-k', userSig: signCheckoutUser('user-k', SECRET) }, ...data } })
    return POST(new Request('http://localhost/api/billing/webhook', { method: 'POST', body: raw, headers: { 'paddle-signature': signPaddle(raw, SECRET) } }))
  }

  it('ein neueres Ereignis landet dazwischen: das ältere überschreibt es nicht', async () => {
    // Our event (cancel scheduled, T0+100) reads version 4; the other request applies a newer one (past_due, T0+200).
    st.before = () => { st.sub = { ...st.sub, status: 'past_due', eventAt: T0 + 200, version: 5 } }
    const res = await post(T0 + 100, { scheduled_change: { action: 'cancel', effective_at: iso(T0 + 30 * 86_400) } })
    expect(await res.json()).toEqual({ ok: true, result: 'unchanged' })          // read again: stale now
    expect(st.sub).toMatchObject({ status: 'past_due', version: 5 })
    const writes = fake.log.filter((q) => q.sql.startsWith('update "subscription"'))
    expect(writes).toHaveLength(1)
    expect(writes[0].sql).toMatch(/"subscription"."version" = \$\d+/)
  })

  it('ein anderes Ereignis landet dazwischen: neu gelesen, beide Änderungen bleiben', async () => {
    st.before = () => { st.sub = { ...st.sub, paddleCustomerId: 'ctm_1', eventAt: T0 + 50, version: 5 } }
    const res = await post(T0 + 100, { scheduled_change: { action: 'cancel', effective_at: iso(T0 + 30 * 86_400) } })
    expect(await res.json()).toEqual({ ok: true, result: 'applied' })
    expect(st.sub).toMatchObject({ cancelAtPeriodEnd: true, version: 6 })
    expect(fake.log.filter((q) => q.sql.startsWith('update "subscription"'))).toHaveLength(2)
  })

  it('die Zeile ändert sich ständig: 500, Paddle stellt erneut zu', async () => {
    const bump = () => { st.sub = { ...st.sub, version: (st.sub!.version as number) + 1 }; st.before = bump }
    st.before = bump
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await post(T0 + 100, { status: 'past_due' })).status).toBe(500)
    } finally { err.mockRestore(); st.before = null }
  })
})

describe('Live schalten: zwei Anfragen gleichzeitig', async () => {
  const { commitLiveEntry } = await import('@/lib/plan/draft-store')
  const { runAsUser } = await import('@/lib/server/scope')
  const today = '2026-11-02'
  const entry = (id: string, planStart: string, end: string): LiveEntry => ({ draftId: `d_${id}`, liveAt: '', block: { id, planStart, end, race: { name: id, shortName: id } } as unknown as TrainingBlock })
  const commit = (e: LiveEntry, max: number) => runAsUser('user-k', () => commitLiveEntry(e, max, today), { profile: null })
  const stored = () => (JSON.parse(st.settings.get('plan_blocks') ?? '{"blocks":[]}').blocks as LiveEntry[]).map((x) => x.block.id)

  it('Kostenlos: die andere Anfrage schaltet zwischen Lesen und Schreiben live → diese bekommt den Plus-Hinweis', async () => {
    st.beforeSetting = () => { st.settings.set('plan_blocks', JSON.stringify({ v: 1, blocks: [entry('other', '2027-06-07', '2027-09-30')] })) }
    const r = await commit(entry('mine', '2026-12-07', '2027-03-28'), 1)
    expect(r).toMatchObject({ code: 'plus-required' })
    expect(stored()).toEqual(['other'])
  })

  it('Kostenlos, beide gleichzeitig: genau einer geht live', async () => {
    const rs = await Promise.all([commit(entry('a', '2026-12-07', '2027-03-28'), 1), commit(entry('b', '2027-06-07', '2027-09-30'), 1)])
    expect(rs.filter((r) => r === null)).toHaveLength(1)
    expect(rs.filter((r) => r?.code === 'plus-required')).toHaveLength(1)
    expect(stored()).toHaveLength(1)
  })

  it('Plus, beide gleichzeitig: beide live, keiner geht verloren', async () => {
    const rs = await Promise.all([commit(entry('a', '2026-12-07', '2027-03-28'), Infinity), commit(entry('b', '2027-06-07', '2027-09-30'), Infinity)])
    expect(rs).toEqual([null, null])
    expect(stored().sort()).toEqual(['a', 'b'])
  })
})
