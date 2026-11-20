// AC-1 and AC-7 (Phase 4), Free + Plus (Phase 9, AC-1 and AC-4): plan state → features; the trial ends in Free;
// export and deletion are never gated.
import { describe, expect, it } from 'vitest'
import { PLUS_FEATURES, SELF_HOST, STATE_LABEL, TRIAL_DAYS, entitlements, fromClient, planState, stateNotice, toClient, upsellText, type Feature, type SubscriptionLike } from '@/lib/billing/entitlements'

const NOW = 1_800_000_000
const DAY = 86_400
const sub = (s: Partial<SubscriptionLike>): SubscriptionLike => ({ status: 'active', tier: null, trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, ...s })
const on = (e: ReturnType<typeof entitlements>) => (Object.keys(e.features) as Feature[]).filter((f) => e.features[f]).sort()

describe('Planstatus', () => {
  it('ohne BILLING_ENABLED immer self-host, egal was gespeichert ist', () => {
    expect(planState(null, NOW, false)).toBe('self-host')
    expect(planState(sub({ status: 'canceled', tier: 'basic' }), NOW, false)).toBe('self-host')
  })

  it('Testphase: 30 Tage ab Anmeldung, danach kostenlos', () => {
    const trial = sub({ status: 'trialing', trialEndsAt: NOW + TRIAL_DAYS * DAY })
    expect(planState(trial, NOW, true)).toBe('trial')
    expect(planState(trial, NOW + 29 * DAY, true)).toBe('trial')
    expect(planState(trial, NOW + 30 * DAY, true)).toBe('free')
    expect(planState(null, NOW, true)).toBe('free')
  })

  it('bezahlt: Plus aus dem Abo; past_due behält es; Kündigung endet am Periodenende, danach kostenlos', () => {
    expect(planState(sub({ tier: 'plus' }), NOW, true)).toBe('plus')
    expect(planState(sub({ tier: 'plus', status: 'trialing' }), NOW, true)).toBe('plus')
    expect(planState(sub({ tier: 'plus', status: 'past_due' }), NOW, true)).toBe('past_due')
    const cancelled = sub({ tier: 'plus', cancelAtPeriodEnd: true, currentPeriodEnd: NOW + DAY })
    expect(planState(cancelled, NOW, true)).toBe('plus')
    expect(planState(cancelled, NOW + DAY, true)).toBe('free')
    expect(planState(sub({ tier: 'plus', status: 'canceled' }), NOW, true)).toBe('free')
    expect(planState(sub({ tier: 'plus', status: 'paused' }), NOW, true)).toBe('free')
  })

  it('ein gekündigtes Abo lässt die Testphase nicht wieder aufleben', () => {
    for (const tier of ['plus', 'basic']) expect(planState(sub({ tier, status: 'canceled', trialEndsAt: NOW + DAY }), NOW, true)).toBe('free')
  })

  it('ein gespeichertes Basic (früherer Tarif) und unbekannte Stufen zählen nicht als bezahlt', () => {
    expect(planState(sub({ tier: 'basic' }), NOW, true)).toBe('free')
    expect(planState(sub({ tier: 'basic', status: 'past_due' }), NOW, true)).toBe('free')
    expect(planState(sub({ tier: 'gold' }), NOW, true)).toBe('free')
  })
})

describe('Funktionen je Status', () => {
  const all = ['autoAdapt', 'delete', 'export', 'multiPlan', 'ownMethod', 'plan', 'raceDay', 'rebuild', 'recoveryInPlan', 'sync']
  const free = ['delete', 'export', 'plan', 'sync']

  it('self-host, Testphase und Plus: alles, beliebig viele Pläne', () => {
    for (const e of [SELF_HOST, entitlements(sub({ status: 'trialing', trialEndsAt: NOW + DAY }), NOW, true), entitlements(sub({ tier: 'plus' }), NOW, true)]) {
      expect(on(e)).toEqual(all)
      expect(e.maxLivePlans).toBe(Infinity)
    }
    expect(SELF_HOST.billing).toBe(false)
  })

  // Phase 9, AC-1
  it('Testphase vorbei: kostenlos — Sync und ein Plan, ohne die Plus-Funktionen', () => {
    const e = entitlements(sub({ status: 'trialing', trialEndsAt: NOW - 1 }), NOW, true)
    expect(e.state).toBe('free')
    expect(e.tier).toBeNull()
    expect(e.features.sync && e.features.plan).toBe(true)
    expect(on(e)).toEqual(free)
    for (const f of PLUS_FEATURES) expect(e.features[f]).toBe(false)
    expect(e.maxLivePlans).toBe(1)
  })

  it('kostenlos ist jeder Weg ohne laufendes Plus: kein Abo, gekündigt, pausiert, gespeichertes Basic', () => {
    const subs = [null, sub({ tier: 'plus', status: 'canceled' }), sub({ tier: 'plus', status: 'paused' }), sub({ tier: 'plus', cancelAtPeriodEnd: true, currentPeriodEnd: NOW }), sub({ tier: 'basic' })]
    for (const s of subs) {
      const e = entitlements(s, NOW, true)
      expect(e.state).toBe('free')
      expect(on(e)).toEqual(free)
      expect(e.maxLivePlans).toBe(1)
    }
  })

  it('PLUS_FEATURES ist genau das, was Plus über Kostenlos hinaus bringt', () => {
    expect([...PLUS_FEATURES].sort()).toEqual(all.filter((f) => !free.includes(f)))
  })

  it('past_due: Plus bleibt, bis Paddle kündigt', () => {
    const e = entitlements(sub({ tier: 'plus', status: 'past_due' }), NOW, true)
    expect(e.state).toBe('past_due')
    expect(e.tier).toBe('plus')
    expect(on(e)).toEqual(all)
    expect(e.maxLivePlans).toBe(Infinity)
  })

  // Phase 9, AC-4
  it('Export und Löschen sind in jedem Status erlaubt', () => {
    const subs = [null, sub({ tier: 'basic' }), sub({ tier: 'plus' }), sub({ tier: 'plus', status: 'past_due' }), sub({ tier: 'basic', status: 'past_due' }), sub({ status: 'canceled', tier: 'plus' }), sub({ tier: 'plus', status: 'paused' }), sub({ status: 'trialing', trialEndsAt: NOW + DAY }), sub({ status: 'trialing', trialEndsAt: NOW - 1 })]
    const seen = new Set<string>()
    for (const s of subs) for (const billing of [true, false]) {
      const e = entitlements(s, NOW, billing)
      seen.add(e.state)
      expect(e.features.export && e.features.delete).toBe(true)
    }
    expect([...seen].sort()).toEqual(Object.keys(STATE_LABEL).sort())
  })

  it('JSON-tauglich hin und zurück (Infinity)', () => {
    const c = toClient(SELF_HOST)
    expect(JSON.parse(JSON.stringify(c)).maxLivePlans).toBeNull()
    expect(fromClient(JSON.parse(JSON.stringify(c))).maxLivePlans).toBe(Infinity)
  })

  it('Hinweistexte: Testphase zählt Tage und sagt, dass es kostenlos weitergeht; past_due erklärt ruhig; Kostenlos hat keinen Hinweis', () => {
    const trial = stateNotice(entitlements(sub({ status: 'trialing', trialEndsAt: NOW + 3 * DAY }), NOW, true), NOW)
    expect(trial).toContain('noch 3 Tage')
    expect(trial).toContain('kostenlos weiter')
    expect(stateNotice(entitlements(sub({ tier: 'plus', status: 'past_due' }), NOW, true), NOW)).toContain('Zahlung')
    expect(stateNotice(entitlements(sub({ tier: 'plus', cancelAtPeriodEnd: true, currentPeriodEnd: NOW + DAY }), NOW, true), NOW)).toContain('kostenlos weiter')
    expect(stateNotice(entitlements(sub({ tier: 'plus' }), NOW, true), NOW)).toBeNull()
    expect(stateNotice(entitlements(null, NOW, true), NOW)).toBeNull()
    expect(stateNotice(SELF_HOST, NOW)).toBeNull()
  })

  it('Texte: „Kostenlos“ als Status; die Hinweise nennen Plus, ohne Druck und ohne „abgelaufen“', () => {
    expect(STATE_LABEL.free).toBe('Kostenlos')
    for (const f of PLUS_FEATURES) {
      expect(upsellText(f)).toMatch(/Plus/)
      expect(upsellText(f)).not.toMatch(/abgelaufen|!/)
    }
  })
})
