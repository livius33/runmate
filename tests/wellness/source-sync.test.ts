// The activity sync survives the wellness step: source errors and a missing wellness_days table (deploy before the
// migration) are logged, the sync result stays as before; nights are stored per user before the plan engine runs.
// Fake database, fake Garmin client, mocked engine.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { encrypt } from '@/lib/crypto'
import { garminAccounts } from '@/lib/db/schema'
import { runAsUser } from '@/lib/server/scope'
import { todayLocal } from '@/lib/dates'
import { setGarminClientFactory } from '@/lib/sources/garmin-login/client'
import { useFakeDb, rowOf, type Query } from '../scope/fake-db'
import { installFakeGarmin, listActivity, sleepNight } from '../sources/garmin-fake'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }) }))
vi.mock('@/lib/analytics/store-metrics', () => ({ storeRunMetrics: async () => null }))
const order: string[] = []
vi.mock('@/lib/plan/engine-store', () => ({ runAndSaveEngine: async () => { order.push('engine'); return { log: [] } } }))

const { garminLoginSource: garmin } = await import('@/lib/sources/garmin-login')
const { runSync, syncSource } = await import('@/lib/sources/sync')

const asUser = <T>(id: string, fn: () => Promise<T>) => runAsUser(id, fn, { profile: null })

let fakeGarmin: ReturnType<typeof installFakeGarmin>
let fake: ReturnType<typeof useFakeDb>
let wellnessTable: 'ok' | 'missing' = 'ok'

beforeAll(() => { process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64') })
beforeEach(() => {
  order.length = 0
  wellnessTable = 'ok'
  fakeGarmin = installFakeGarmin()
  fakeGarmin.activities = [listActivity(0, new Date(Date.now() - 86_400_000))]
  fake = useFakeDb((q: Query) => {
    if (/"wellness_days"/.test(q.sql)) {
      if (wellnessTable === 'missing') throw Object.assign(new Error('relation "wellness_days" does not exist'), { code: '42P01' })
      if (q.sql.startsWith('insert')) order.push('save')
      return []
    }
    if (!/from "garmin_accounts"/.test(q.sql)) return []
    const user = String(q.params[0])
    if (q.sql.startsWith('select "user_id", "username_enc"')) return [rowOf(garminAccounts, { userId: user, usernameEnc: encrypt(`${user}@example.com`), passwordEnc: encrypt('pw'), updatedAt: 0 })]
    return [[null, null, null, null, null]]
  })
})
afterEach(() => { fake.restore(); fakeGarmin.restore() })
afterAll(() => setGarminClientFactory(null))

describe('Garmin-Sync mit Wellness-Schritt', () => {
  it('fehlende Tabelle: Schritt übersprungen, Aktivitäten-Sync läuft normal', async () => {
    wellnessTable = 'missing'
    const r = await asUser('user-a', () => syncSource(garmin))
    expect(r).toMatchObject({ inserted: 1, failed: 0 })
    expect(r.log).toContain('garmin wellness: table wellness_days missing (migration pending), skipped')
  })

  it('Garmin-Fehler im Wellness-Schritt brechen den Sync nicht, im Log nur Codes', async () => {
    fakeGarmin.wellnessError = () => Object.assign(new Error('Error in getSleepData: 500 Authorization: Bearer abc'), { status: 500 })
    const r = await asUser('user-a', () => syncSource(garmin))
    expect(r.inserted).toBe(1)
    expect(r.log.filter((l) => l.startsWith('garmin wellness fetch failed'))).toEqual([
      expect.stringMatching(/\(unavailable\)$/), expect.stringMatching(/\(unavailable\)$/),
    ])
    expect(r.log).toContain('garmin wellness: 0 nights stored (0 with data), 2 requests')
    expect(r.log.join('\n')).not.toMatch(/Bearer|Authorization/)
    expect(fake.log.some((q) => q.sql.startsWith('insert into "wellness_days"'))).toBe(false)
  })

  it('Nächte werden je Nutzer gespeichert, vor der Engine (die Engine liest die Nacht von heute)', async () => {
    fakeGarmin.sleep[await asUser('user-a', async () => todayLocal())] = sleepNight()
    const r = await asUser('user-a', () => runSync())
    expect(order).toEqual(['save', 'engine'])
    expect(r.log).toContain('garmin wellness: 8 nights stored (1 with data), 8 requests')
    const insert = fake.log.find((q) => q.sql.startsWith('insert into "wellness_days"'))!
    expect(insert.sql).toMatch(/on conflict \("user_id","date"\) do update/)
    expect(insert.params.filter((p) => p === 'user-a')).toHaveLength(8)
    expect(insert.params).not.toContain('user-b')
    expect(insert.params).toContain('garmin')
  })
})
