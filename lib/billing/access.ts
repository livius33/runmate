// Server side of the entitlements (Phase 4): the current user's subscription row → what they may do. Without
// BILLING_ENABLED nothing is read and everything is allowed. Cached per request in the scope.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { subscription } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { currentScope } from '@/lib/scope'
import { billingEnabled } from './config'
import { SELF_HOST, TRIAL_DAYS, entitlements, upsellText, type Entitlements, type Feature } from './entitlements'

export type SubscriptionRow = typeof subscription.$inferSelect

const CACHE_KEY = 'billing.entitlements'
export const nowS = () => Math.floor(Date.now() / 1000)

export async function loadSubscription(): Promise<SubscriptionRow | null> {
  const [row] = await db.select().from(subscription).where(own(subscription)).limit(1)
  return row ?? null
}

// First sign-in with billing on: the 30-day trial starts (no card). Returns the row (existing or new).
export async function ensureSubscription(): Promise<SubscriptionRow | null> {
  if (!billingEnabled()) return null
  const existing = await loadSubscription()
  if (existing) return existing
  const t = nowS()
  const [row] = await db.insert(subscription)
    .values(mine({ status: 'trialing', trialEndsAt: t + TRIAL_DAYS * 86_400, updatedAt: t }))
    .onConflictDoNothing()
    .returning()
  return row ?? (await loadSubscription())
}

export async function currentEntitlements(): Promise<Entitlements> {
  if (!billingEnabled()) return SELF_HOST
  const cache = currentScope().cache
  const hit = cache.get(CACHE_KEY) as Entitlements | undefined
  if (hit) return hit
  const e = entitlements(await loadSubscription(), nowS(), true)
  cache.set(CACHE_KEY, e)
  return e
}

// Forget the cached value (after the webhook or a cancellation changed the row in this request).
export function clearEntitlementsCache() {
  currentScope().cache.delete(CACHE_KEY)
}

export const PLUS_REQUIRED = 'plus-required'

// The 402 a gated route answers with: German message, the feature and the state (for the upsell in the UI).
export function featureResponse(feature: Feature, e: Entitlements) {
  return NextResponse.json({ error: upsellText(feature, e), code: PLUS_REQUIRED, feature, state: e.state }, { status: 402 })
}

// null when allowed, otherwise the 402 response.
export async function requireFeature(feature: Feature): Promise<Response | null> {
  const e = await currentEntitlements()
  return e.features[feature] ? null : featureResponse(feature, e)
}

export async function hasFeature(feature: Feature): Promise<boolean> {
  return (await currentEntitlements()).features[feature]
}
