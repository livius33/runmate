// AC-1 and AC-7 (Phase 4): plan state → features; the trial; export and deletion are never gated.
import { describe, expect, it } from 'vitest'
import { PLUS_FEATURES, SELF_HOST, TRIAL_DAYS, entitlements, fromClient, planState, stateNotice, toClient, type Feature, type SubscriptionLike } from '@/lib/billing/entitlements'

const NOW = 1_800_000_000
const DAY = 86_400
const sub = (s: Partial<SubscriptionLike>): SubscriptionLike => ({ status: 'active', tier: null, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...s })
const on = (e: ReturnType<typeof entitlements>) => (Object.keys(e.features) as Feature[]).filter((f) => e.features[f]).sort()

describe('Planstatus', () => {
  it('ohne BILLING_ENABLED immer self-host, egal was gespeichert ist', () => {
    expect(planState(null, NOW, false)).toBe('self-host')
    expect(planState(sub({ status: 'canceled', tier: 'basic' }), NOW, false)).toBe('self-host')
  })

  it('Testphase: 30 Tage ab Anmeldung, danach abgelaufen', () => {
    const trial = sub({ status: 'trialing', trialEndsAt: NOW + TRIAL_DAYS * DAY })
    expect(planState(trial, NOW, true)).toBe('trial')
    expect(planState(trial, NOW + 29 * DAY, true)).toBe('trial')
    expect(planState(trial, NOW + 30 * DAY, true)).toBe('expired')
    expect(planState(null, NOW, true)).toBe('expired')
  })

  it('bezahlt: Stufe aus dem Abo; past_due behält die Stufe; Kündigung endet am Periodenende', () => {
    expect(planState(sub({ tier: 'basic' }), NOW, true)).toBe('basic')
    expect(planState(sub({ tier: 'plus', status: 'trialing' }), NOW, true)).toBe('plus')
    expect(planState(sub({ tier: 'plus', status: 'past_due' }), NOW, true)).toBe('past_due')
    const cancelled = sub({ tier: 'plus', cancelAtPeriodEnd: true, currentPeriodEnd: NOW + DAY })
    expect(planState(cancelled, NOW, true)).toBe('plus')
    expect(planState(cancelled, NOW + DAY, true)).toBe('expired')
    expect(planState(sub({ tier: 'plus', status: 'canceled' }), NOW, true)).toBe('expired')
    expect(planState(sub({ tier: 'plus', status: 'paused' }), NOW, true)).toBe('expired')
  })

  it('ein gekündigtes Abo lässt die Testphase nicht wieder aufleben', () => {
    expect(planState(sub({ tier: 'basic', status: 'canceled', trialEndsAt: NOW + DAY }), NOW, true)).toBe('expired')
  })

  it('unbekannte Stufe zählt nicht als bezahlt', () => {
    expect(planState(sub({ tier: 'gold' }), NOW, true)).toBe('expired')
  })
})

describe('Funktionen je Status', () => {
  const all = ['autoAdapt', 'delete', 'export', 'multiPlan', 'ownMethod', 'plan', 'raceDay', 'sync']

  it('self-host, Testphase und Plus: alles, beliebig viele Pläne', () => {
    for (const e of [SELF_HOST, entitlements(sub({ status: 'trialing', trialEndsAt: NOW + DAY }), NOW, true), entitlements(sub({ tier: 'plus' }), NOW, true)]) {
      expect(on(e)).toEqual(all)
      expect(e.maxLivePlans).toBe(Infinity)
    }
    expect(SELF_HOST.billing).toBe(false)
  })

  it('Basic: Sync, Analyse, ein Plan — ohne die Plus-Funktionen', () => {
    const e = entitlements(sub({ tier: 'basic' }), NOW, true)
    expect(on(e)).toEqual(['delete', 'export', 'plan', 'sync'])
    for (const f of PLUS_FEATURES) expect(e.features[f]).toBe(false)
    expect(e.maxLivePlans).toBe(1)
  })

  it('past_due: die Funktionen der bezahlten Stufe', () => {
    expect(on(entitlements(sub({ tier: 'basic', status: 'past_due' }), NOW, true))).toEqual(['delete', 'export', 'plan', 'sync'])
    expect(on(entitlements(sub({ tier: 'plus', status: 'past_due' }), NOW, true))).toEqual(all)
  })

  it('abgelaufen: nur Export und Löschen, kein neuer Plan', () => {
    const e = entitlements(null, NOW, true)
    expect(on(e)).toEqual(['delete', 'export'])
    expect(e.maxLivePlans).toBe(0)
  })

  it('Export und Löschen sind in jedem Status erlaubt', () => {
    const subs = [null, sub({ tier: 'basic' }), sub({ tier: 'plus' }), sub({ tier: 'basic', status: 'past_due' }), sub({ status: 'canceled', tier: 'plus' }), sub({ status: 'trialing', trialEndsAt: NOW - 1 })]
    for (const s of subs) for (const billing of [true, false]) {
      const e = entitlements(s, NOW, billing)
      expect(e.features.export && e.features.delete).toBe(true)
    }
  })

  it('JSON-tauglich hin und zurück (Infinity)', () => {
    const c = toClient(SELF_HOST)
    expect(JSON.parse(JSON.stringify(c)).maxLivePlans).toBeNull()
    expect(fromClient(JSON.parse(JSON.stringify(c))).maxLivePlans).toBe(Infinity)
  })

  it('Hinweistexte: Testphase zählt Tage, past_due und abgelaufen erklären ruhig', () => {
    expect(stateNotice(entitlements(sub({ status: 'trialing', trialEndsAt: NOW + 3 * DAY }), NOW, true), NOW)).toContain('noch 3 Tage')
    expect(stateNotice(entitlements(sub({ tier: 'basic', status: 'past_due' }), NOW, true), NOW)).toContain('Zahlung')
    expect(stateNotice(entitlements(null, NOW, true), NOW)).toContain('exportierbar')
    expect(stateNotice(SELF_HOST, NOW)).toBeNull()
  })
})
