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
// 12-05: only these two exact values count; anything else (a typo, "prod", unset) means billing is not ready, so no
// checkout is offered and no API call goes out (lib/billing/paddle.ts).
export const paddleEnvValid = () => process.env.PADDLE_ENV === 'sandbox' || process.env.PADDLE_ENV === 'production'
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

// What is missing before a checkout may be offered (12-05, finding 9): without the webhook secret a payment cannot be
// attached to an account, without the API key nothing can be cancelled. Names only, never values.
export function billingProblems(): string[] {
  const has = (name: string) => !!process.env[name]?.trim()
  const ids = priceIds()
  return [
    ...(ids.plus.month || ids.plus.year ? [] : ['PADDLE_PRICE_PLUS_MONTH or PADDLE_PRICE_PLUS_YEAR']),
    ...['NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', 'PADDLE_API_KEY', 'PADDLE_WEBHOOK_SECRET'].filter((n) => !has(n)),
    ...(paddleEnvValid() ? [] : ['PADDLE_ENV (exactly sandbox or production)']),
  ]
}

// Billing on and every Paddle setting in place: only then is a checkout offered.
export function billingReady(): boolean {
  return billingEnabled() && billingProblems().length === 0
}

// The one start-up line (instrumentation.ts) when billing is on but not ready. Returns it (tests).
export function logBillingConfig(log: (line: string) => void = console.error): string | null {
  if (!billingEnabled() || billingReady()) return null
  const line = `[billing] BILLING_ENABLED is set but checkout stays off: missing or invalid ${billingProblems().join(', ')}`
  log(line)
  return line
}
