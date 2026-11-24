// AC-3 (12-04): ALLOWED_EMAILS is checked where a handler establishes its user, not only in the middleware: the
// handler is called directly here, without any middleware.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFakeDb } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown>, primary: new Map<string, string>(), lookups: 0 }))
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: clerk.userId, sessionClaims: clerk.claims }),
  clerkClient: async () => ({ users: { getUser: async (id: string) => {
    clerk.lookups++
    const email = clerk.primary.get(id)
    return { primaryEmailAddress: email ? { emailAddress: email } : null }
  } } }),
}))

const fake = useFakeDb()
afterAll(() => fake.restore())

const { runAsUser, withUser } = await import('@/lib/server/scope')
const { ALLOWLIST_CACHE_MS, userAllowed } = await import('@/lib/server/allowlist')
const { currentScope } = await import('@/lib/scope')

let ran = 0
const handler = withUser(async () => { ran++; return Response.json({ user: currentScope().userId }) })
const as = (userId: string, claims: Record<string, unknown> = {}) => { clerk.userId = userId; clerk.claims = claims }

beforeEach(() => { ran = 0; clerk.lookups = 0; clerk.primary.clear(); process.env.ALLOWED_EMAILS = 'runner@example.com, Coach@Example.com' })
afterEach(() => { delete process.env.ALLOWED_EMAILS })

describe('ALLOWED_EMAILS in withUser', () => {
  it('Adresse nicht auf der Liste: 403, der Handler läuft nicht', async () => {
    as('user-x1', { email: 'stranger@example.com' })
    const res = await handler()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Dieses Konto hat keinen Zugang.' })
    expect(ran).toBe(0)
  })

  it('Adresse auf der Liste (Groß-/Kleinschreibung egal): läuft als dieser Nutzer', async () => {
    as('user-x2', { email: 'coach@example.com' })
    const res = await handler()
    expect([res.status, await res.json()]).toEqual([200, { user: 'user-x2' }])
  })

  it('ohne email-Claim: die Hauptadresse bei Clerk zählt, einmal gefragt und dann gemerkt', async () => {
    clerk.primary.set('user-x3', 'stranger@example.com')
    as('user-x3')
    expect((await handler()).status).toBe(403)
    expect((await handler()).status).toBe(403)
    expect(clerk.lookups).toBe(1)
    clerk.primary.set('user-x4', 'runner@example.com')
    as('user-x4')
    expect((await handler()).status).toBe(200)
  })

  it('ohne Adresse überhaupt: kein Zugang', async () => {
    as('user-x5')
    expect((await handler()).status).toBe(403)
  })

  it('die Entscheidung gilt nur eine Weile', async () => {
    clerk.primary.set('user-x6', 'runner@example.com')
    const t = Date.now()
    expect(await userAllowed('user-x6', undefined, t)).toBe(true)
    clerk.primary.set('user-x6', 'stranger@example.com')
    expect(await userAllowed('user-x6', undefined, t + 1000)).toBe(true)
    expect(await userAllowed('user-x6', undefined, t + ALLOWLIST_CACHE_MS + 1)).toBe(false)
  })

  it('ohne Sitzung weiterhin 401', async () => {
    clerk.userId = null
    expect((await handler()).status).toBe(401)
  })

  it('in einem schon betretenen Scope (Demo, Cron, Token-Routen): keine Clerk-Abfrage, keine Sperre', async () => {
    clerk.userId = null
    const res = await runAsUser('demo-user', () => handler(), { profile: null })
    expect([res.status, await res.json()]).toEqual([200, { user: 'demo-user' }])
    expect(clerk.lookups).toBe(0)
  })

  it('ohne ALLOWED_EMAILS: jeder angemeldete Nutzer, keine Clerk-Abfrage', async () => {
    delete process.env.ALLOWED_EMAILS
    as('user-x7')
    expect((await handler()).status).toBe(200)
    expect(clerk.lookups).toBe(0)
  })
})
