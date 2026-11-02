// Clerk webhooks are signed with Svix (Phase 4; no dependency): `svix-signature: v1,<base64 HMAC-SHA256 of
// "<svix-id>.<svix-timestamp>.<raw body>">` (space-separated list), key = base64 part of `whsec_…`.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SVIX_TOLERANCE_S = 300

export interface SvixHeaders { id: string | null; timestamp: string | null; signature: string | null }

const key = (secret: string) => Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')

export function verifySvix(rawBody: string, h: SvixHeaders, secret: string | undefined, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature || !/^\d+$/.test(h.timestamp)) return false
  if (Math.abs(nowS - Number(h.timestamp)) > SVIX_TOLERANCE_S) return false
  const expected = createHmac('sha256', key(secret)).update(`${h.id}.${h.timestamp}.${rawBody}`).digest()
  return h.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const got = Buffer.from(sig, 'base64')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}

export function signSvix(rawBody: string, id: string, secret: string, ts = Math.floor(Date.now() / 1000)): SvixHeaders {
  const sig = createHmac('sha256', key(secret)).update(`${id}.${ts}.${rawBody}`).digest('base64')
  return { id, timestamp: String(ts), signature: `v1,${sig}` }
}
