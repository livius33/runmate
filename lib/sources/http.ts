// SourceError → HTTP response (German message + code; never library output).
import { NextResponse } from 'next/server'
import { safeError } from './sync'
import type { SourceErrorCode } from './types'

const STATUS: Record<SourceErrorCode, number> = {
  invalid: 400, 'not-connected': 409, auth: 422, mfa: 422, locked: 422,
  'rate-limited': 429, 'login-changed': 502, unavailable: 503, unknown: 500,
}

export function sourceErrorResponse(err: unknown, where: string) {
  const e = safeError(err)
  // Only the code: messages of non-SourceErrors (and anything they carry) stay out of the logs.
  console.error(`[${where}]`, e.code)
  return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: STATUS[e.code] })
}
