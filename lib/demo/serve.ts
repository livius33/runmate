// Serving the demo (Phase 5): every demo request runs as the demo user in a read-only scope — never as the signed-in
// user, never with a Clerk lookup (lib/server/scope.ts getUserId returns the scope's user first). The database refuses
// writes in that scope (lib/db/index.ts). Server only.
import { NextResponse } from 'next/server'
import { ReadOnlyError } from '@/lib/scope'
import { runAsUser } from '@/lib/server/scope'
import { DEMO_PROFILE, DEMO_USER_ID } from './athlete'

export const DEMO_READ_ONLY = 'Demo – nur ansehen'

export function runAsDemo<T>(fn: () => Promise<T>): Promise<T> {
  return runAsUser(DEMO_USER_ID, fn, { profile: DEMO_PROFILE, readOnly: true, demo: true })
}

export const readOnlyResponse = () => NextResponse.json({ error: DEMO_READ_ONLY, code: 'demo-read-only' }, { status: 403 })
export const isReadOnlyError = (e: unknown) => e instanceof ReadOnlyError
