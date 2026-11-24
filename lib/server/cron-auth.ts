// The cron routes' check (12-04): `Authorization: Bearer <CRON_SECRET>`, compared in constant time. Without
// CRON_SECRET every request is refused.
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

// Both sides hashed first: timingSafeEqual needs equal lengths, and the hash keeps the secret's length out of the timing.
const digest = (s: string) => createHash('sha256').update(s).digest()

export function cronAuthorized(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false
  return timingSafeEqual(digest(req.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`))
}

// 401 for a request without the secret, otherwise null.
export function cronUnauthorized(req: Request): Response | null {
  return cronAuthorized(req) ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
