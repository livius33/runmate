// AC-2 (Phase 4; Free + Plus since Phase 9): Plus routes answer 402 with a German upsell for a free account and write
// nothing; Plus and self-host pass. A free account keeps one live plan (Phase 9, AC-2).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { useFakeDb, rowOf } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user-b' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

// The stored subscription: null = a trial that ended (free), 'plus' = an active Plus subscription.
const tier = { value: null as string | null }
// Two stored drafts (own method, template) and one live block that has not ended yet (settings rows, read one key at
// a time).
const draft = (id: string, templateId: string) => ({ id, goalId: 'g1', templateId, start: '2026-11-09', overrides: {}, createdAt: '', updatedAt: '' })
const stored: Record<string, unknown> = {
  plan_drafts: { v: 1, drafts: [draft('d1', 'runmate-own-marathon'), draft('d2', 'pfitzinger-marathon')] },
  plan_blocks: { v: 1, blocks: [{ draftId: 'd0', liveAt: '', block: { id: 'b0', end: '2027-03-28' } }] },
}
const settingsOn = { value: false }
const running = { value: true }
const fake = useFakeDb((q) => {
  if (/from "subscription"/.test(q.sql)) {
    return [rowOf(subscription, tier.value
      ? { userId: q.params[0], status: 'active', tier: tier.value, cancelAtPeriodEnd: false, updatedAt: 0 }
      : { userId: q.params[0], status: 'trialing', trialEndsAt: 1, cancelAtPeriodEnd: false, updatedAt: 0 })]
  }
  if (settingsOn.value && /^select "value" from "settings"/.test(q.sql) && String(q.params[1]) in stored) {
    if (q.params[1] === 'plan_blocks' && !running.value) return []
    return [[JSON.stringify(stored[String(q.params[1])])]]
  }
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; process.env.BILLING_ENABLED = '1'; tier.value = null; running.value = true })
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
    it(`Kostenlos: ${name} → 402 mit Hinweis, nichts geschrieben`, async () => {
      const res = await call()
      expect(res.status).toBe(402)
      const body = await res.json()
      expect(body.code).toBe('plus-required')
      expect(body.error).toMatch(/Plus/)
      expect(body.error).not.toMatch(/abgelaufen/)
      expect(writes()).toEqual([])
    })

    it(`gespeichertes Basic (früherer Tarif) zählt als kostenlos: ${name} → 402`, async () => {
      tier.value = 'basic'
      expect((await call()).status).toBe(402)
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
    const live = async (draftId = 'd1') => {
      const { goLive } = await import('@/lib/plan/draft-store')
      const { runAsUser } = await import('@/lib/server/scope')
      return runAsUser('user-b', () => goLive(draftId, '2026-11-02'), { profile: null })
    }

    // Phase 9, AC-2
    it('Kostenlos mit einem laufenden Plan: der zweite geht nicht live (mehrere Pläne = Plus)', async () => {
      for (const id of ['d1', 'd2']) {
        const r = await live(id)
        expect(r).toMatchObject({ code: 'plus-required', error: expect.stringContaining('ein Plan gleichzeitig') })
        expect((r as { error: string }).error).toMatch(/Plus/)
        expect((r as { error: string }).error).not.toMatch(/abgelaufen/)
      }
      expect(writes()).toEqual([])
    })

    it('Kostenlos mit einem laufenden Plan: die Route antwortet 402 plus-required', async () => {
      vi.useFakeTimers({ now: new Date('2026-11-02T10:00:00Z'), toFake: ['Date'] })
      try {
        const res = await drafts(json('/api/running/drafts', 'POST', { action: 'live', draftId: 'd2' }))
        expect(res.status).toBe(402)
        const body = await res.json()
        expect(body.code).toBe('plus-required')
        expect(body.error).toMatch(/Plus/)
        expect(body.error).not.toMatch(/abgelaufen/)
      } finally { vi.useRealTimers() }
    })

    it('Kostenlos ohne laufenden Plan: der erste Plan ist erlaubt (scheitert erst an den fehlenden Planquellen)', async () => {
      running.value = false
      const r = await live('d2').catch((e: Error) => ({ error: e.message }))
      expect(r).not.toMatchObject({ code: 'plus-required' })
    })

    it('Kostenlos ohne laufenden Plan: die eigene Methode bleibt Plus', async () => {
      running.value = false
      expect(await live('d1')).toMatchObject({ code: 'plus-required', error: expect.stringContaining('eigene Methode') })
    })

    it('Plus: an der Abo-Prüfung vorbei (scheitert erst an den fehlenden Planquellen)', async () => {
      tier.value = 'plus'
      const r = await live().catch((e: Error) => ({ error: e.message }))
      expect(r).not.toMatchObject({ code: 'plus-required' })
    })
  })
})
