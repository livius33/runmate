// AC-2 (Phase 4): Plus routes answer 402 with a German upsell for Basic and write nothing; Plus and self-host pass.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-b' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const tier = { value: 'basic' as string | null }
// One stored draft and one live block that has not ended yet (settings rows, read one key at a time).
const stored: Record<string, unknown> = {
  plan_drafts: { v: 1, drafts: [{ id: 'd1', goalId: 'g1', templateId: 'own-marathon', start: '2026-11-09', overrides: {}, createdAt: '', updatedAt: '' }] },
  plan_blocks: { v: 1, blocks: [{ draftId: 'd0', liveAt: '', block: { id: 'b0', end: '2027-03-28' } }] },
}
const settingsOn = { value: false }
const fake = useFakeDb((q) => {
  if (/from "subscription"/.test(q.sql) && tier.value) return [rowOf(subscription, { userId: q.params[0], status: 'active', tier: tier.value, cancelAtPeriodEnd: false, updatedAt: 0 })]
  if (settingsOn.value && /^select "value" from "settings"/.test(q.sql) && String(q.params[1]) in stored) return [[JSON.stringify(stored[String(q.params[1])])]]
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; process.env.BILLING_ENABLED = '1'; tier.value = 'basic' })
afterEach(() => { delete process.env.BILLING_ENABLED })

const { POST: drafts } = await import('@/app/api/running/drafts/route')
const { PUT: checklist } = await import('@/app/api/running/race-checklist/route')
const { GET: raceAnalysis } = await import('@/app/api/running/race-analysis/route')

const json = (url: string, method: string, body?: unknown) => new Request(`http://localhost${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
const writes = () => fake.log.filter((q) => /^(insert|update|delete)/i.test(q.sql.trim()))

describe('Plus-Funktionen auf dem Server', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['eigene Methode speichern', () => drafts(json('/api/running/drafts', 'POST', { action: 'own', templateId: 'own-marathon', tuning: {}, name: 'X' }))],
    ['Checkliste abhaken', () => checklist(json('/api/running/race-checklist', 'PUT', { id: 'bib', checked: true }))],
    ['Rennanalyse', () => raceAnalysis(json('/api/running/race-analysis?id=a1', 'GET'))],
  ]

  for (const [name, call] of calls) {
    it(`Basic: ${name} → 402 mit Hinweis, nichts geschrieben`, async () => {
      const res = await call()
      expect(res.status).toBe(402)
      const body = await res.json()
      expect(body.code).toBe('plus-required')
      expect(body.error).toMatch(/Plus/)
      expect(writes()).toEqual([])
    })

    it(`Plus: ${name} → kein 402`, async () => {
      tier.value = 'plus'
      expect((await call()).status).not.toBe(402)
    })

    it(`self-host: ${name} → kein 402, kein Abo gelesen`, async () => {
      delete process.env.BILLING_ENABLED
      expect((await call()).status).not.toBe(402)
      expect(fake.log.some((q) => /from "subscription"/.test(q.sql))).toBe(false)
    })
  }

  describe('Live schalten', () => {
    beforeEach(() => { settingsOn.value = true })
    afterEach(() => { settingsOn.value = false })
    const live = async () => {
      const { goLive } = await import('@/lib/plan/draft-store')
      const { runAsUser } = await import('@/lib/server/scope')
      return runAsUser('user-b', () => goLive('d1', '2026-11-02'), { profile: null })
    }

    it('Basic mit einem laufenden Plan: der zweite geht nicht live (mehrere Pläne = Plus)', async () => {
      expect(await live()).toMatchObject({ code: 'plus-required', error: expect.stringContaining('ein Plan gleichzeitig') })
      expect(writes()).toEqual([])
    })

    it('abgelaufen: auch kein erster Plan', async () => {
      tier.value = null
      expect(await live()).toMatchObject({ code: 'plus-required', error: expect.stringContaining('abgelaufen') })
    })

    it('Plus: an der Abo-Prüfung vorbei (scheitert erst an den fehlenden Planquellen)', async () => {
      tier.value = 'plus'
      const r = await live().catch((e: Error) => ({ error: e.message }))
      expect(r).not.toMatchObject({ code: 'plus-required' })
    })
  })
})
