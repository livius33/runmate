// AC-11 and AC-12 (Phase 4): export holds one JSON file per user table with only the user's rows and no secrets;
// deletion reaches every table with user_id in the schema (enumerated here independently, so a new table cannot be
// forgotten); account deletion cancels Paddle and deletes the Clerk user; Clerk's user.deleted webhook does the same.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { strFromU8, unzipSync } from 'fflate'
import * as schema from '@/lib/db/schema'
import { subscription } from '@/lib/db/schema'
import { SECRET_COLUMNS, deleteHealthData, deleteUserData, exportUserData, userTables } from '@/lib/account/data'
import { signSvix, verifySvix } from '@/lib/account/svix'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-d' as string | null, deleted: [] as string[] }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: clerk.userId }),
  clerkClient: async () => ({ users: { deleteUser: async (id: string) => { clerk.deleted.push(id) } } }),
}))

const USER = 'user-d'
const SCHEMA_USER_TABLES = Object.values(schema).filter((v) => is(v, PgTable) && 'userId' in getTableColumns(v as PgTable)).map((t) => getTableName(t as PgTable)).sort()
const tableOf = (sql: string) => sql.match(/(?:from|into|update|delete from) "(\w+)"/)?.[1]

const st = { sub: false }
const fake = useFakeDb((q) => {
  const t = tableOf(q.sql)
  if (!q.sql.startsWith('select') || !t) return []
  if (t === 'subscription') return st.sub ? [rowOf(subscription, { userId: USER, status: 'active', tier: 'plus', paddleSubscriptionId: 'sub_d', paddleCustomerId: 'ctm_d', cancelAtPeriodEnd: false, updatedAt: 0 })] : []
  const table = Object.values(schema).find((v) => is(v, PgTable) && getTableName(v as PgTable) === t) as PgTable
  // One row per table, every text column filled with a marker, JSON columns with JSON.
  const cols = getTableColumns(table)
  const values = Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, k === 'userId' ? q.params[0] : k.endsWith('Json') ? '{"a":1}' : c.dataType === 'string' ? `${k}-value` : c.dataType === 'boolean' ? false : 1]))
  return [rowOf(table, values)]
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; clerk.deleted = []; st.sub = false })
afterEach(() => { for (const k of ['BILLING_ENABLED', 'PADDLE_API_KEY', 'PADDLE_PRICE_PLUS_MONTH']) delete process.env[k]; vi.unstubAllGlobals() })

const { runAsUser } = await import('@/lib/server/scope')
const asUser = <T,>(fn: () => Promise<T>) => runAsUser(USER, fn, { profile: null })
const deletes = () => fake.log.filter((q) => q.sql.startsWith('delete from'))

describe('Nutzertabellen', () => {
  it('userTables() = jede Tabelle mit user_id im Schema', () => {
    expect(userTables().map((t) => t.name).sort()).toEqual(SCHEMA_USER_TABLES)
    expect(SCHEMA_USER_TABLES.length).toBeGreaterThanOrEqual(12)
  })

  it('Kindtabellen vor ihren Eltern (Fremdschlüssel)', () => {
    const order = userTables().map((t) => t.name)
    expect(order.indexOf('activity_streams')).toBeLessThan(order.indexOf('activities'))
  })

  it('jede verschlüsselte Spalte (…Enc) ist vom Export ausgenommen', () => {
    for (const { name, table } of userTables()) {
      for (const col of Object.keys(getTableColumns(table)).filter((c) => c.endsWith('Enc'))) expect(SECRET_COLUMNS[name] ?? []).toContain(col)
    }
  })
})

describe('Löschen (Art. 17)', () => {
  it('ein DELETE je Nutzertabelle, jeweils nur für diesen Nutzer', async () => {
    await asUser(deleteUserData)
    const d = deletes()
    expect(d.map((q) => tableOf(q.sql)).sort()).toEqual(SCHEMA_USER_TABLES)
    for (const q of d) {
      expect(q.sql).toMatch(/where "\w+"\."user_id" = \$1/)
      expect(q.params).toEqual([USER])
    }
  })

  it('Gesundheitsdaten löschen: Aktivitäten, Streams, Apple-Health-Werte, Nächte – nichts sonst', async () => {
    await asUser(deleteHealthData)
    expect(deletes().map((q) => tableOf(q.sql))).toEqual(['activity_streams', 'activities', 'health_days', 'health_workouts', 'wellness_days'])
  })
})

describe('Export (Art. 20)', () => {
  it('ZIP mit einer JSON-Datei je Tabelle, nur eigene Zeilen, keine Geheimnisse', async () => {
    const files = unzipSync(await asUser(() => exportUserData(new Date('2026-11-02T10:00:00Z'))))
    const names = Object.keys(files).sort()
    expect(names).toEqual([...SCHEMA_USER_TABLES.map((t) => `runmate-export/${t}.json`), 'runmate-export/README.txt'].sort())
    for (const q of fake.log) expect(q.params[0]).toBe(USER)
    const garmin = JSON.parse(strFromU8(files['runmate-export/garmin_accounts.json']))
    expect(Object.keys(garmin[0])).not.toEqual(expect.arrayContaining(['usernameEnc']))
    for (const col of ['usernameEnc', 'passwordEnc', 'sessionEnc']) expect(garmin[0]).not.toHaveProperty(col)
    expect(JSON.parse(strFromU8(files['runmate-export/link_tokens.json']))[0]).not.toHaveProperty('token')
    const acts = JSON.parse(strFromU8(files['runmate-export/activities.json']))
    expect(acts[0].metricsJson).toEqual({ a: 1 })                         // JSON columns as JSON
    expect(acts[0].userId).toBe(USER)
    expect(strFromU8(files['runmate-export/README.txt'])).toContain('activities.json: 1 Zeile')
  })

  it('auch ohne aktives Abo erreichbar (nie gesperrt)', async () => {
    process.env.BILLING_ENABLED = '1'                                   // no subscription row → expired
    const { GET } = await import('@/app/api/account/export/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
  })
})

describe('Konto löschen', async () => {
  const { POST } = await import('@/app/api/account/delete/route')
  const del = (confirm: string) => POST(new Request('http://localhost/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm }) }))
  const paddle: string[] = []
  const stub = (ok: boolean) => {
    paddle.length = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      paddle.push(`${url} ${init.body}`)
      return ok
        ? new Response(JSON.stringify({ data: { id: 'sub_d', status: 'canceled', customer_id: 'ctm_d', items: [{ price: { id: 'pri_pm' } }] } }))
        : new Response('{}', { status: 500 })
    }))
  }

  it('ohne Bestätigungswort: 400, nichts gelöscht', async () => {
    expect((await del('ja')).status).toBe(400)
    expect(deletes()).toEqual([])
  })

  it('mit Abo: Paddle sofort beendet, alle Tabellen geleert, Clerk-Nutzer gelöscht', async () => {
    Object.assign(process.env, { BILLING_ENABLED: '1', PADDLE_API_KEY: 'k', PADDLE_PRICE_PLUS_MONTH: 'pri_pm' })
    st.sub = true
    stub(true)
    expect((await del('LÖSCHEN')).status).toBe(200)
    expect(paddle).toEqual(['https://sandbox-api.paddle.com/subscriptions/sub_d/cancel {"effective_from":"immediately"}'])
    expect(deletes().map((q) => tableOf(q.sql)).sort()).toEqual(SCHEMA_USER_TABLES)
    expect(clerk.deleted).toEqual([USER])
  })

  it('Paddle nicht erreichbar: 502, nichts gelöscht (erneut versuchen)', async () => {
    Object.assign(process.env, { BILLING_ENABLED: '1', PADDLE_API_KEY: 'k' })
    st.sub = true
    stub(false)
    expect((await del('LÖSCHEN')).status).toBe(502)
    expect(deletes()).toEqual([])
    expect(clerk.deleted).toEqual([])
  })
})

describe('Clerk-Webhook user.deleted', async () => {
  const { POST } = await import('@/app/api/webhooks/clerk/route')
  const SECRET = 'whsec_' + Buffer.from('clerk-test-secret-0123456789').toString('base64')
  beforeEach(() => { process.env.CLERK_WEBHOOK_SECRET = SECRET })
  afterEach(() => { delete process.env.CLERK_WEBHOOK_SECRET })
  const send = (body: unknown, headers?: Record<string, string>) => {
    const raw = JSON.stringify(body)
    const h = signSvix(raw, 'msg_1', SECRET)
    return POST(new Request('http://localhost/api/webhooks/clerk', { method: 'POST', body: raw, headers: headers ?? { 'svix-id': h.id!, 'svix-timestamp': h.timestamp!, 'svix-signature': h.signature! } }))
  }

  it('Svix-Signatur: gültig, falsch, zu alt', () => {
    const now = 1_700_000_000
    const h = signSvix('{}', 'msg', SECRET, now)
    expect(verifySvix('{}', h, SECRET, now)).toBe(true)
    expect(verifySvix('{ }', h, SECRET, now)).toBe(false)
    expect(verifySvix('{}', h, 'whsec_' + Buffer.from('other').toString('base64'), now)).toBe(false)
    expect(verifySvix('{}', h, SECRET, now + 301)).toBe(false)
    expect(verifySvix('{}', { ...h, signature: `v1,AAAA ${h.signature}` }, SECRET, now)).toBe(true)
  })

  it('ungültige Signatur: 401, nichts gelöscht', async () => {
    const res = await send({ type: 'user.deleted', data: { id: 'user-x' } }, { 'svix-id': 'm', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA' })
    expect(res.status).toBe(401)
    expect(fake.log).toEqual([])
  })

  it('user.deleted: alle Zeilen dieses Nutzers gelöscht, Clerk nicht noch einmal aufgerufen', async () => {
    const res = await send({ type: 'user.deleted', data: { id: 'user-x', deleted: true } })
    expect(await res.json()).toEqual({ ok: true, result: 'deleted' })
    const d = deletes()
    expect(d.map((q) => tableOf(q.sql)).sort()).toEqual(SCHEMA_USER_TABLES)
    for (const q of d) expect(q.params).toEqual(['user-x'])
    expect(clerk.deleted).toEqual([])
  })

  it('andere Ereignisse: 200, nichts gelöscht', async () => {
    expect(await (await send({ type: 'user.updated', data: { id: 'user-x' } })).json()).toEqual({ ok: true, result: 'ignored' })
    expect(deletes()).toEqual([])
  })
})
