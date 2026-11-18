// AC-3 (Phase 9): without Plus the engine's plan changes come back as suggestions and this morning's night flags stay
// out of its fitness; with Plus, in the trial and on a self-hosted install they join it and the change is applied.
// The store runs against the example block; the nights are mocked (two flags = a weak night), the DB is the fake.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscription } from '@/lib/db/schema'
import { useFakeDb, rowOf } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-n' }) }))
const nights = vi.hoisted(() => ({ asked: 0 }))
vi.mock('@/lib/wellness/store', async (orig) => ({
  ...(await orig<typeof import('@/lib/wellness/store')>()),
  loadRecoveryToday: async (today: string) => { nights.asked++; return { date: today, flags: ['hrv', 'rhr'] } },
}))

const NOW = Math.floor(Date.now() / 1000)
const SUBS: Record<string, Record<string, unknown> | null> = {
  'Testphase vorbei': { status: 'trialing', trialEndsAt: NOW - 86_400 },
  'kein Abo gespeichert': null,
  'Plus gekündigt': { status: 'canceled', tier: 'plus' },
  'gespeichertes Basic': { status: 'active', tier: 'basic' },
  Plus: { status: 'active', tier: 'plus' },
  'Zahlung offen': { status: 'past_due', tier: 'plus' },
  Testphase: { status: 'trialing', trialEndsAt: NOW + 86_400 },
}
const st = { sub: null as Record<string, unknown> | null, sync: null as string | null }
const fake = useFakeDb((q) => {
  if (/from "subscription"/.test(q.sql)) return st.sub ? [rowOf(subscription, { userId: q.params[0], cancelAtPeriodEnd: false, updatedAt: 0, ...st.sub })] : []
  if (st.sync && /^select "value" from "settings"/.test(q.sql) && q.params[1] === 'last_sync:garmin') return [[JSON.stringify({ at: st.sync })]]
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { fake.log.length = 0; nights.asked = 0; st.sub = null; st.sync = null; process.env.BILLING_ENABLED = '1' })
afterEach(() => { delete process.env.BILLING_ENABLED })

const { runAndSaveEngine, loadRecoveryForPlan } = await import('@/lib/plan/engine-store')
const { runAsUser } = await import('@/lib/server/scope')
const asUser = <T>(fn: () => Promise<T>) => runAsUser('user-n', fn, { profile: null })
const saved = () => fake.log.filter((q) => q.sql.startsWith('insert into "settings"') && q.params.includes('plan_engine'))

// Monday of the example block's week 2: the Schwelle session on Tuesday is the next hard day.
const TODAY = '2026-10-05'
const HARD = '2026-10-06'

describe('Nachtwerte im Plan (recoveryInPlan)', () => {
  for (const name of ['Testphase vorbei', 'kein Abo gespeichert', 'Plus gekündigt', 'gespeichertes Basic']) {
    it(`Kostenlos (${name}): die Nacht wird nicht gelesen, kein Ermüdungsschutz, nichts gespeichert`, async () => {
      st.sub = SUBS[name]
      const r = await asUser(() => runAndSaveEngine(TODAY))
      expect(nights.asked).toBe(0)
      expect(r.suggestions).toEqual([])
      expect(r.log.filter((c) => c.rule === 'fatigue')).toEqual([])
      expect(r.overrides).toEqual({})
      expect(saved()).toEqual([])
      expect(await asUser(() => loadRecoveryForPlan(TODAY))).toBeUndefined()
    })
  }

  for (const name of ['Plus', 'Zahlung offen', 'Testphase', 'self-host']) {
    it(`${name}: die schwache Nacht fließt ein, der Ermüdungsschutz ändert den Plan selbst`, async () => {
      if (name === 'self-host') delete process.env.BILLING_ENABLED
      else st.sub = SUBS[name]
      const r = await asUser(() => runAndSaveEngine(TODAY))
      expect(nights.asked).toBe(1)
      expect(r.suggestions).toBeUndefined()
      const [c] = r.log.filter((x) => x.rule === 'fatigue')
      expect(c).toMatchObject({ status: 'active', key: `fatigue:${HARD}` })
      expect(c.reason).toMatch(/HRV niedrig/)
      expect(r.overrides[HARD]).toMatchObject({ type: 'easy' })
      expect(saved()).toHaveLength(1)
      expect(await asUser(() => loadRecoveryForPlan(TODAY))).toMatchObject({ flags: ['hrv', 'rhr'] })
    })
  }
})

// A missed key session (synced through Wednesday, Tuesday's Schwelle not run) gives the engine something to change
// that has nothing to do with the night.
describe('Planänderungen ohne Plus sind Vorschläge', () => {
  const THU = '2026-10-08'
  beforeEach(() => { st.sync = `${THU}T05:00:00.000Z` })

  it('Kostenlos: die Änderung kommt als Vorschlag zurück, der gespeicherte Plan bleibt, die Nacht zählt nicht', async () => {
    st.sub = SUBS['Testphase vorbei']
    const r = await asUser(() => runAndSaveEngine(THU))
    expect(r.suggestions!.length).toBeGreaterThan(0)
    for (const s of r.suggestions!) {
      expect(s.status).toBe('active')
      expect(s.rule).not.toBe('fatigue')
    }
    expect(r.overrides).toEqual({})
    expect(r.log.filter((c) => c.status === 'active' && Object.keys(c.after).length)).toEqual([])
    expect(nights.asked).toBe(0)
  })

  it('Plus: dieselbe Lage wird angewendet und gespeichert, keine Vorschläge', async () => {
    st.sub = SUBS.Plus
    const r = await asUser(() => runAndSaveEngine(THU))
    expect(r.suggestions).toBeUndefined()
    expect(Object.keys(r.overrides).length).toBeGreaterThan(0)
    expect(r.log.some((c) => c.rule === 'fatigue')).toBe(true)
    expect(saved()).toHaveLength(1)
  })
})
