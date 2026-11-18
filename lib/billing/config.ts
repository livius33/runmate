// Billing configuration from the environment (Phase 4). Server only: the browser gets what it needs through
// GET /api/billing (client token, environment, price ids), never the API key or the webhook secret.
import type { Interval, Tier } from './entitlements'

// Off unless set: a self-hosted install has no prices, no trial, no Paddle and every feature (lib/billing/entitlements.ts).
export function billingEnabled(): boolean {
  const v = (process.env.BILLING_ENABLED ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

// Art. 9 consent is asked on hosted instances (billing on) or when a self-hoster serving others turns it on.
export function healthConsentRequired(): boolean {
  const v = (process.env.REQUIRE_HEALTH_CONSENT ?? '').trim().toLowerCase()
  return billingEnabled() || v === '1' || v === 'true'
}

export type PaddleEnv = 'sandbox' | 'production'

export const paddleEnv = (): PaddleEnv => (process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox')
export const paddleApiBase = (env: PaddleEnv = paddleEnv()) => (env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com')

const PRICE_ENV: Record<Tier, Record<Interval, string>> = {
  plus: { month: 'PADDLE_PRICE_PLUS_MONTH', year: 'PADDLE_PRICE_PLUS_YEAR' },
}

export interface PriceIds { plus: Record<Interval, string | null> }

export function priceIds(): PriceIds {
  const get = (name: string) => process.env[name]?.trim() || null
  return { plus: { month: get(PRICE_ENV.plus.month), year: get(PRICE_ENV.plus.year) } }
}

// Which plan a Paddle price id stands for (webhook → subscription row). Unknown ids → null (ignored, logged).
export function priceInfo(priceId: string | null | undefined, ids: PriceIds = priceIds()): { tier: Tier; interval: Interval } | null {
  if (!priceId) return null
  for (const interval of ['month', 'year'] as const) if (ids.plus[interval] === priceId) return { tier: 'plus', interval }
  return null
}

// Shown next to the checkout buttons; the amount charged is always the one configured at Paddle.
export const PRICE_LABEL: Record<Tier, Record<Interval, string>> = {
  plus: { month: '9 € / Monat', year: '79 € / Jahr' },
}
