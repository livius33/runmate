// AC-10 and AC-11 (Phase 5): expired accounts are deleted only after 12 months without activity and a reminder at
// least 30 days old (never without one, so nothing is deleted while no mailer is wired); a deleted account leaves a
// tombstone, and a late Paddle webhook for it writes nothing. DB = the pg-proxy fake, Paddle and Clerk mocked.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { signPaddle } from '@/lib/billing/paddle'
import { RETENTION, dueForDeletion, type RetentionRow } from '@/lib/billing/retention'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-r' as string | null, deleted: [] as string[] }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: clerk.userId }),
  clerkClient: async () => ({ users: { deleteUser: async (id: string) => { clerk.deleted.push(id) } } }),
}))

const DAY = 86_400
const NOW = 1_900_000_000
const row = (over: Partial<RetentionRow> = {}): RetentionRow => ({
  status: 'trialing', tier: null, trialEndsAt: NOW - 400 * DAY, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  canceledAt: null, lastSeenAt: null, noticeSentAt: null, updatedAt: NOW - 400 * DAY, ...over,
})

describe('dueForDeletion (rein)', () => {
  it('laufende, bezahlte und offene Konten: nie', () => {
    expect(dueForDeletion(row({ trialEndsAt: NOW + DAY }), NOW)).toBe('keep')
    expect(dueForDeletion(row({ status: 'active', tier: 'basic' }), NOW)).toBe('keep')
    expect(dueForDeletion(row({ status: 'past_due', tier: 'plus' }), NOW)).toBe('keep')
  })

  it('abgelaufen: Erinnerung ab 11 Monaten Inaktivität, vorher nichts', () => {
    const ended = (days: number) => row({ trialEndsAt: NOW - days * DAY, updatedAt: NOW - days * DAY })
    expect(dueForDeletion(ended(RETENTION.idleDays - RETENTION.noticeDays - 1), NOW)).toBe('keep')
    expect(dueForDeletion(ended(RETENTION.idleDays - RETENTION.noticeDays), NOW)).toBe('notice')
    expect(dueForDeletion(ended(800), NOW)).toBe('notice')             // long idle, but never reminded: remind first
  })

  it('der letzte Besuch zählt, nicht nur das Ende des Abos', () => {
    expect(dueForDeletion(row({ lastSeenAt: NOW - 100 * DAY }), NOW)).toBe('keep')
  })

  it('gelöscht erst mit Erinnerung ≥ 30 Tage und 12 Monaten Inaktivität', () => {
    expect(dueForDeletion(row({ noticeSentAt: NOW - 30 * DAY }), NOW)).toBe('delete')
    expect(dueForDeletion(row({ noticeSentAt: NOW - 29 * DAY }), NOW)).toBe('keep')
    const recent = row({ trialEndsAt: NOW - 340 * DAY, updatedAt: NOW - 340 * DAY, noticeSentAt: NOW - 31 * DAY })
    expect(dueForDeletion(recent, NOW)).toBe('keep')                    // reminder old enough, but not 12 months idle yet
  })

  it('ein Besuch nach der Erinnerung macht sie ungültig', () => {
    const back = row({ noticeSentAt: NOW - 40 * DAY, lastSeenAt: NOW - 35 * DAY })
    expect(dueForDeletion(back, NOW)).toBe('keep')
    expect(dueForDeletion(back, NOW + 400 * DAY)).toBe('notice')         // idle again: a new reminder first
  })

  it('gekündigt: die Frist beginnt am Periodenende', () => {
    const canceled = row({ status: 'canceled', tier: 'basic', trialEndsAt: null, currentPeriodEnd: NOW - 200 * DAY, canceledAt: NOW - 230 * DAY })
    expect(dueForDeletion(canceled, NOW)).toBe('keep')
    expect(dueForDeletion(canceled, NOW + 135 * DAY)).toBe('notice')
  })
})

// ─── Cron and tombstone against the fake DB ──────────────────────────────────

const st = { subs: [] as Record<string, unknown>[], tomb: new Set<string>() }
const fake = useFakeDb((q) => {
  if (/^select .* from "deleted_users"/.test(q.sql)) return st.tomb.has(String(q.params[0])) ? [[q.params[0]]] : []
  if (/^select .* from "subscription"$/.test(q.sql.trim())) return st.subs.map((s) => rowOf(subscription, s))
  if (/^select .* from "subscription"/.test(q.sql)) return st.subs.filter((s) => s.userId === q.params[0]).map((s) => rowOf(subscription, s))
  return []
})
afterAll(() => fake.restore())
const env = { BILLING_ENABLED: '1', CRON_SECRET: 'cron-test', PADDLE_WEBHOOK_SECRET: 'pdl_secret', PADDLE_PRICE_PLUS_MONTH: 'pri_pm' }
beforeEach(() => { Object.assign(process.env, env); fake.log.length = 0; st.subs = []; st.tomb.clear(); clerk.deleted = [] })
afterEach(() => { for (const k of Object.keys(env)) delete process.env[k]; vi.restoreAllMocks() })

const writes = () => fake.log.filter((q) => /^(insert|update|delete)/.test(q.sql))
const now = () => Math.floor(Date.now() / 1000)

describe('Cron /api/cron/expired-accounts', async () => {
  const { GET } = await import('@/app/api/cron/expired-accounts/route')
  const call = (auth = 'Bearer cron-test') => GET(new Request('http://localhost/api/cron/expired-accounts', { headers: { authorization: auth } }) as never)

  it('ohne CRON_SECRET: 401, keine Abfrage', async () => {
    expect((await call('Bearer nope')).status).toBe(401)
    expect(fake.log).toEqual([])
  })

  it('ohne Mailer: keine Erinnerung vermerkt, nichts gelöscht – auch nicht bei Fälligkeit', async () => {
    const t = now()
    st.subs = [
      { userId: 'user-old', status: 'trialing', trialEndsAt: t - 800 * DAY, cancelAtPeriodEnd: false, updatedAt: t - 800 * DAY },
      { userId: 'user-pay', status: 'active', tier: 'plus', cancelAtPeriodEnd: false, updatedAt: t },
    ]
    const res = await call()
    expect(await res.json()).toMatchObject({ ok: true, accounts: 2, notices: 0, unsent: 1, deleted: 0, mailer: false })
    expect(writes()).toEqual([])
  })

  it('fällige Löschung (Erinnerung vor 31 Tagen): alle Daten, Grabstein, Clerk', async () => {
    const t = now()
    st.subs = [{ userId: 'user-old', status: 'trialing', trialEndsAt: t - 800 * DAY, noticeSentAt: t - 31 * DAY, cancelAtPeriodEnd: false, updatedAt: t - 800 * DAY }]
    expect(await (await call()).json()).toMatchObject({ deleted: 1, failed: 0 })
    const deletes = fake.log.filter((q) => q.sql.startsWith('delete from'))
    expect(deletes.length).toBeGreaterThanOrEqual(12)
    for (const q of deletes) expect(q.params).toEqual(['user-old'])
    expect(deletes.some((q) => q.sql.includes('"deleted_users"'))).toBe(false)
    const tomb = fake.log.find((q) => q.sql.startsWith('insert into "deleted_users"'))!
    expect(tomb.params[0]).toBe('user-old')
    expect(clerk.deleted).toEqual(['user-old'])
  })

  it('Billing aus: nichts gelesen', async () => {
    delete process.env.BILLING_ENABLED
    expect(await (await call()).json()).toEqual({ ok: true, billing: false })
    expect(fake.log).toEqual([])
  })
})

describe('Grabstein gegen späte Paddle-Webhooks', async () => {
  const { POST } = await import('@/app/api/billing/webhook/route')
  const event = (userId: string) => {
    const at = new Date().toISOString()
    return { event_id: `evt_late_${userId}`, event_type: 'subscription.updated', occurred_at: at,
      data: { id: 'sub_9', status: 'canceled', customer_id: 'ctm_9', items: [{ price: { id: 'pri_pm' } }], custom_data: { userId } } }
  }
  const post = (ev: unknown) => {
    const raw = JSON.stringify(ev)
    return POST(new Request('http://localhost/api/billing/webhook', { method: 'POST', body: raw, headers: { 'paddle-signature': signPaddle(raw, 'pdl_secret') } }))
  }

  it('gelöschtes Konto: 200 „deleted-user“, keine Zeile in subscription oder billing_events', async () => {
    st.tomb.add('user-gone')
    expect(await (await post(event('user-gone'))).json()).toEqual({ ok: true, result: 'deleted-user' })
    expect(writes()).toEqual([])
  })

  it('ohne Grabstein: wie bisher angewendet', async () => {
    expect(await (await post(event('user-here'))).json()).toEqual({ ok: true, result: 'applied' })
    expect(fake.log.some((q) => q.sql.startsWith('insert into "subscription"'))).toBe(true)
  })

  it('Konto löschen schreibt den Grabstein nach den Daten', async () => {
    const { runAsUser } = await import('@/lib/server/scope')
    const { deleteAccount } = await import('@/lib/account/delete')
    delete process.env.BILLING_ENABLED
    await runAsUser('user-x', () => deleteAccount({ deleteClerkUser: false, strictBilling: true }), { profile: null })
    const i = fake.log.findIndex((q) => q.sql.startsWith('insert into "deleted_users"'))
    expect(i).toBeGreaterThan(fake.log.findLastIndex((q) => q.sql.startsWith('delete from')))
    expect(fake.log[i].params[0]).toBe('user-x')
  })
})
