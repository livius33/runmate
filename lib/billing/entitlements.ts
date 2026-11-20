// What a user may do (Phase 4), from their plan state. Pure and isomorphic: the server decides with it (lib/billing/
// access.ts) and the dashboard gets the result for its upsells. Data export and account deletion are never gated.
//
// Free = sync, analysis, insights, one live plan edited by hand, the engine's changes as suggestions. Plus = the engine
// applies its changes, whole-plan rebuild, several plans, own method, race-day tools, sleep and HRV feeding the plan.
// The 30-day trial and a self-hosted install (no BILLING_ENABLED) get Plus; after the trial an account continues as Free.

export type Tier = 'plus'
export type Interval = 'month' | 'year'
export type PlanState = 'self-host' | 'trial' | 'free' | 'plus' | 'past_due'

export type Feature =
  | 'sync'        // data comes in: sources, file import, Apple Health
  | 'plan'        // generate a plan and take it live
  | 'autoAdapt'   // the engine applies its changes by itself (otherwise: suggestions)
  | 'rebuild'     // whole-plan rebuild on Plan anpassen: goal, date, interruption (Phase 10)
  | 'multiPlan'   // more than one live generated plan
  | 'ownMethod'   // save an own method
  | 'raceDay'     // race-day tools: pacing analysis, race-week checklist
  | 'recoveryInPlan' // night flags (sleep, HRV, resting HR) join the engine's fitness; the recovery card stays free
  | 'export'      // Art. 20
  | 'delete'      // Art. 17

export const PLUS_FEATURES: Feature[] = ['autoAdapt', 'rebuild', 'multiPlan', 'ownMethod', 'raceDay', 'recoveryInPlan']
const FREE_FEATURES: Feature[] = ['sync', 'plan', 'export', 'delete']
const ALL_FEATURES: Feature[] = [...FREE_FEATURES, ...PLUS_FEATURES]
const ALWAYS: Feature[] = ['export', 'delete']

export const TRIAL_DAYS = 30

// The subscription row as entitlements need it (lib/db/schema.ts subscription; epoch seconds).
export interface SubscriptionLike {
  status: string                 // 'trialing' (in-app) | 'active' | 'past_due' | 'paused' | 'canceled'
  tier: string | null
  trialEndsAt: number | null
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
}

export interface Entitlements {
  state: PlanState
  tier: Tier | null              // the tier paid for (past_due keeps it); null for self-host, trial, free
  features: Record<Feature, boolean>
  maxLivePlans: number           // Infinity = no limit (JSON: null, see toClient)
  billing: boolean               // false = self-host, never show prices or upsells
  trialEndsAt: number | null
  periodEnd: number | null       // renewal date, or the end date after a cancellation
  cancelAtPeriodEnd: boolean
}

// Plus is the only paid tier. A stored 'basic' (the tier sold before Free + Plus) is not paid: the account is free.
const asTier = (t: string | null | undefined): Tier | null => (t === 'plus' ? t : null)

export function planState(sub: SubscriptionLike | null, nowS: number, billingEnabled: boolean): PlanState {
  if (!billingEnabled) return 'self-host'
  if (sub) {
    const tier = asTier(sub.tier)
    // Paddle keeps a cancelled-at-period-end subscription 'active' until then and sends 'canceled' afterwards. If that
    // event is late, the stored period end still ends it.
    const ended = sub.cancelAtPeriodEnd && sub.currentPeriodEnd != null && sub.currentPeriodEnd <= nowS
    if ((sub.status === 'active' || sub.status === 'trialing') && tier && !ended) return tier
    if (sub.status === 'past_due' && tier) return 'past_due'
    if (sub.trialEndsAt != null && nowS < sub.trialEndsAt && !(sub.tier && sub.status === 'canceled')) return 'trial'
  }
  return 'free'
}

function featuresOf(list: Feature[]): Record<Feature, boolean> {
  return Object.fromEntries(ALL_FEATURES.map((f) => [f, list.includes(f) || ALWAYS.includes(f)])) as Record<Feature, boolean>
}

export function entitlements(sub: SubscriptionLike | null, nowS: number, billingEnabled: boolean): Entitlements {
  const state = planState(sub, nowS, billingEnabled)
  const tier = state === 'plus' || state === 'past_due' ? asTier(sub?.tier) : null
  // past_due keeps Plus until Paddle cancels; only a free account is without the Plus features.
  const features = featuresOf(state === 'free' ? FREE_FEATURES : ALL_FEATURES)
  return {
    state,
    tier,
    features,
    maxLivePlans: features.multiPlan ? Infinity : features.plan ? 1 : 0,
    billing: billingEnabled,
    trialEndsAt: billingEnabled ? sub?.trialEndsAt ?? null : null,
    periodEnd: billingEnabled ? sub?.currentPeriodEnd ?? null : null,
    cancelAtPeriodEnd: billingEnabled ? !!sub?.cancelAtPeriodEnd : false,
  }
}

// Self-host: everything, no billing. Also the browser's default before the layout's value arrives.
export const SELF_HOST: Entitlements = entitlements(null, 0, false)

// JSON-safe (Infinity → null) for the layout → browser hand-over and the API.
export type ClientEntitlements = Omit<Entitlements, 'maxLivePlans'> & { maxLivePlans: number | null }
export const toClient = (e: Entitlements): ClientEntitlements => ({ ...e, maxLivePlans: Number.isFinite(e.maxLivePlans) ? e.maxLivePlans : null })
export const fromClient = (e: ClientEntitlements): Entitlements => ({ ...e, maxLivePlans: e.maxLivePlans ?? Infinity })

// ─── German texts (calm, no pressure) ─────────────────────────────────────────

export const FEATURE_LABEL: Record<Feature, string> = {
  sync: 'Synchronisierung und Import',
  plan: 'Trainingsplan',
  autoAdapt: 'Automatische Plananpassung',
  rebuild: 'Plan neu aufbauen',
  multiPlan: 'Mehrere Pläne',
  ownMethod: 'Eigene Methode',
  raceDay: 'Renntag-Werkzeuge',
  recoveryInPlan: 'Schlaf und HRV im Plan',
  export: 'Datenexport',
  delete: 'Konto löschen',
}

export const STATE_LABEL: Record<PlanState, string> = {
  'self-host': 'Selbst gehostet',
  trial: 'Testphase',
  free: 'Kostenlos',
  plus: 'Plus',
  past_due: 'Zahlung offen',
}

// Why a gated action did not run (402 body and the upsell box). Only Plus features are ever gated.
export function upsellText(feature: Feature): string {
  switch (feature) {
    case 'autoAdapt': return 'Mit Plus passt Runmate deinen Plan selbst an. Ohne Plus siehst du die Vorschläge und übernimmst sie mit einem Klick.'
    case 'rebuild': return 'Den ganzen Plan neu aufbauen (neues Ziel, neuer Termin, nach einer Unterbrechung) ist Teil von Runmate Plus. Einzelne Tage und Wochen änderst du weiter von Hand.'
    case 'multiPlan': return 'Ohne Plus ist ein Plan gleichzeitig aktiv. Mit Plus planst du mehrere Rennen parallel.'
    case 'ownMethod': return 'Eine eigene Methode speichern ist Teil von Runmate Plus.'
    case 'raceDay': return 'Die Renntag-Werkzeuge (Pacing-Analyse, Checkliste) sind Teil von Runmate Plus.'
    case 'recoveryInPlan': return 'Mit Plus fließen Schlaf und HRV in die Plananpassung ein. Die Erholungskarte und die Analyse siehst du auch ohne Plus.'
    default: return `${FEATURE_LABEL[feature]} ist Teil von Runmate Plus.`
  }
}

// The line under the status in Settings → Abo and in the header notice (null = nothing to say; Free has no banner).
export function stateNotice(e: Entitlements, nowS: number): string | null {
  const days = (t: number | null) => (t == null ? 0 : Math.max(0, Math.ceil((t - nowS) / 86_400)))
  switch (e.state) {
    case 'trial': return `Testphase: noch ${days(e.trialEndsAt)} ${days(e.trialEndsAt) === 1 ? 'Tag' : 'Tage'} alle Plus-Funktionen, ohne Zahlungsdaten. Danach geht es kostenlos weiter.`
    case 'past_due': return 'Die letzte Zahlung ist nicht durchgegangen. Bitte die Zahlungsart im Kundenportal prüfen; bis dahin läuft alles weiter.'
    case 'free': return null
    default: return e.cancelAtPeriodEnd ? 'Gekündigt – läuft bis zum Ende des bezahlten Zeitraums. Danach geht es kostenlos weiter.' : null
  }
}
