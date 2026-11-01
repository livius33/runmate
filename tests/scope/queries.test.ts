// AC-1/AC-3/AC-5 (Phase 2): the SQL the scoped helpers send — always filtered by the current user, secret links resolve
// to their owner, Garmin secrets leave the app only encrypted.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { runAsUser } from '@/lib/server/scope'
import { getSetting, setSetting } from '@/lib/db/settings'
import { rotateLinkToken, userForLinkToken } from '@/lib/links/tokens'
import { garminAccountStatus, saveGarminAccount } from '@/lib/sources/garmin-login/account'
import { UnauthorizedError } from '@/lib/scope'
import { useFakeDb, type Query } from './fake-db'

const asUser = <T>(id: string, fn: () => Promise<T>) => runAsUser(id, fn, { profile: null })
let fake: ReturnType<typeof useFakeDb>
afterEach(() => fake?.restore())
beforeAll(() => { process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64') })

describe('Abfragen je Nutzer', () => {
  it('settings lesen und schreiben nur mit user_id des angemeldeten Nutzers', async () => {
    fake = useFakeDb(() => [['{"a":1}']])
    const [a, b] = await Promise.all([asUser('user-a', () => getSetting('plan_overrides')), asUser('user-b', () => getSetting('plan_overrides'))])
    expect([a, b]).toEqual(['{"a":1}', '{"a":1}'])
    const reads = fake.log.map((q) => q)
    expect(reads.every((q) => /"settings"\."user_id" = \$1/.test(q.sql))).toBe(true)
    expect(reads.map((q) => q.params[0]).sort()).toEqual(['user-a', 'user-b'])

    await asUser('user-a', () => setSetting('k', 'v'))
    const ins = fake.log.at(-1)!
    expect(ins.sql).toMatch(/insert into "settings" \("user_id", "key", "value"\)/)
    expect(ins.sql).toMatch(/on conflict \("user_id","key"\) do update/)
    expect(ins.params.slice(0, 3)).toEqual(['user-a', 'k', 'v'])
  })

  it('ohne Nutzer: Fehler 401, keine Abfrage', async () => {
    fake = useFakeDb()
    await expect(getSetting('x')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(fake.log).toEqual([])
  })
})

describe('Geheime Links: Token → Nutzer', () => {
  const token = 'A'.repeat(32)

  it('ein gültiges Token findet seinen Nutzer, ein unbekanntes keinen', async () => {
    fake = useFakeDb((q) => (q.params[0] === token ? [['user-b']] : []))
    expect(await userForLinkToken('calendar', token)).toBe('user-b')
    expect(fake.log[0].sql).toMatch(/where \("link_tokens"\."token" = \$1 and "link_tokens"\."kind" = \$2\)/)
    expect(fake.log[0].params).toEqual([token, 'calendar', 1])
    expect(await userForLinkToken('health', 'B'.repeat(32))).toBeNull()
  })

  it('kaputte Tokens erreichen die Datenbank nicht', async () => {
    fake = useFakeDb()
    for (const t of ['', 'short', `${token}x`, `${'A'.repeat(31)}/`, "' or 1=1 --"]) expect(await userForLinkToken('calendar', t)).toBeNull()
    expect(fake.log).toEqual([])
  })

  it('neues Token: für diesen Nutzer und diese Art, das alte wird ersetzt', async () => {
    fake = useFakeDb()
    const t = await asUser('user-a', () => rotateLinkToken('health'))
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/)
    const q = fake.log[0]
    expect(q.sql).toMatch(/insert into "link_tokens" \("token", "user_id", "kind", "created_at"\)/)
    expect(q.sql).toMatch(/on conflict \("user_id","kind"\) do update set "token" = \$\d+/)
    expect(q.params.slice(0, 3)).toEqual([t, 'user-a', 'health'])
  })
})

describe('Garmin-Zugang je Nutzer', () => {
  it('speichert nur verschlüsselt und gibt nie Werte zurück', async () => {
    fake = useFakeDb((q: Query) => (q.sql.startsWith('select') ? [[1700000000, 1700000100, 1700000000, null, null]] : []))
    await asUser('user-a', () => saveGarminAccount('runner@example.com', 'hunter2-secret', { oauth1: { oauth_token: 'tok-1', oauth_token_secret: 'sec-1' }, oauth2: { access_token: 'acc-1' } }))
    const ins = fake.log[0]
    const sent = JSON.stringify(ins.params)
    expect(sent).not.toContain('runner@example.com')
    expect(sent).not.toContain('hunter2-secret')
    for (const secret of ['tok-1', 'sec-1', 'acc-1']) expect(sent).not.toContain(secret)
    expect(ins.params[0]).toBe('user-a')
    expect(String(ins.params[1])).toMatch(/^v1\./)
    const status = await asUser('user-a', () => garminAccountStatus())
    expect(status).toEqual({ hasCredentials: true, hasSession: true, sessionUpdatedAt: 1700000000, syncedAt: 1700000100, consentedAt: 1700000000, errorCode: null, errorAt: null })
    expect(fake.log.at(-1)!.sql).toMatch(/"garmin_accounts"\."user_id" = \$1/)
  })
})
