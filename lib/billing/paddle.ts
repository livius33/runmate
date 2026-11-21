// Paddle Billing over plain fetch (Phase 4; no SDK). Paddle is the merchant of record: it runs the checkout, takes
// the payment, handles VAT and sends the invoices. Runmate keeps one subscription row per user in sync (webhook.ts).
// Docs: developer.paddle.com — webhooks/signature-verification, api-reference/subscriptions, customer-portal-sessions.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { paddleApiBase } from './config'

// Signatures older than this are refused (replays; the event id check catches the rest).
export const SIGNATURE_TOLERANCE_S = 300

// `Paddle-Signature: ts=<unix seconds>;h1=<hex HMAC-SHA256 of "<ts>:<raw body>">` — several h1 during a secret rotation.
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false
  const parts = header.split(';').map((p) => p.trim().split('='))
  const ts = parts.find(([k]) => k === 'ts')?.[1]
  const sigs = parts.filter(([k, v]) => k === 'h1' && v).map(([, v]) => v)
  if (!ts || !/^\d+$/.test(ts) || !sigs.length) return false
  if (Math.abs(nowS - Number(ts)) > SIGNATURE_TOLERANCE_S) return false
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest()
  return sigs.some((s) => {
    if (!/^[0-9a-f]+$/i.test(s)) return false
    const got = Buffer.from(s, 'hex')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}

// Sign like Paddle does (tests and local webhook simulation).
export function signPaddle(rawBody: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
  return `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex')}`
}

// The checkout runs in the browser, so its custom data is the client's word. The server signs the user id it hands
// out (GET /api/billing) and the webhook takes a claimed id only with this signature: nobody can attach a
// subscription they bought to someone else's account.
export function signCheckoutUser(userId: string, secret: string | undefined = process.env.PADDLE_WEBHOOK_SECRET): string | null {
  return secret ? createHmac('sha256', secret).update(`checkout-user:${userId}`).digest('hex') : null
}
export function verifyCheckoutUser(userId: string, sig: unknown, secret: string | undefined = process.env.PADDLE_WEBHOOK_SECRET): boolean {
  const expected = signCheckoutUser(userId, secret)
  if (!expected || typeof sig !== 'string' || !/^[0-9a-f]{64}$/i.test(sig)) return false
  return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
}

export class PaddleError extends Error {
  constructor(readonly status: number, readonly code: string) { super(`Paddle API ${status} ${code}`) }
}

// Paddle API call; errors carry only status and Paddle's error code (never the key, never the full body).
async function paddle<T>(path: string, body?: unknown, method: 'GET' | 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const key = process.env.PADDLE_API_KEY
  if (!key) throw new PaddleError(0, 'not-configured')
  const res = await fetch(`${paddleApiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  })
  const json = await res.json().catch(() => null) as { data?: T; error?: { code?: string } } | null
  if (!res.ok || !json?.data) throw new PaddleError(res.status, json?.error?.code ?? 'unknown')
  return json.data
}

// The parts of Paddle's subscription entity Runmate reads.
export interface PaddleSubscription {
  id: string
  status: string                                         // active | trialing | past_due | paused | canceled
  customer_id: string
  items?: { price?: { id?: string } }[]
  current_billing_period?: { starts_at: string; ends_at: string } | null
  scheduled_change?: { action: string; effective_at: string } | null
  canceled_at?: string | null
  updated_at?: string | null
  custom_data?: Record<string, unknown> | null
}

// §312k BGB button and account deletion. `next_billing_period`: it stays active until the paid period ends.
export function cancelSubscription(subscriptionId: string, when: 'next_billing_period' | 'immediately'): Promise<PaddleSubscription> {
  return paddle<PaddleSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { effective_from: when })
}

// Taking a cancellation back (Settings → Abo): removes the scheduled change, the subscription renews as before.
export function removeScheduledChange(subscriptionId: string): Promise<PaddleSubscription> {
  return paddle<PaddleSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { scheduled_change: null }, 'PATCH')
}

// Customer portal (payment method, invoices, plan change): an authenticated link for this customer.
export async function portalUrl(customerId: string, subscriptionIds: string[]): Promise<string> {
  const d = await paddle<{ urls: { general: { overview: string } } }>(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, { subscription_ids: subscriptionIds })
  return d.urls.general.overview
}
