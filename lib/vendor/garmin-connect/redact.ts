// SPDX-License-Identifier: MIT
// Runmate addition to the vendored garmin-connect: what may reach the console or leave the client as an error. An
// axios error carries its request config (Authorization: Bearer …, the OAuth1 header, the login form) and often the
// response; none of that is ever logged or passed on. Only a fixed label, the HTTP status and a scrubbed message are.

// Header and query shapes that carry Garmin secrets.
const PATTERNS: RegExp[] = [
  /Bearer\s+[^\s"',]+/gi,
  /OAuth\s+[^\r\n]*/gi,
  /\b(oauth_[a-z_]+|access_token|refresh_token|jti|mfa_token|password|username|_csrf|ticket)\b(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
]

export function scrub(text: string, secrets: (string | null | undefined)[] = []): string {
  let out = text
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('[redacted]')
  for (const re of PATTERNS) out = out.replace(re, (_m, key: unknown, sep: unknown) => (typeof key === 'string' && typeof sep === 'string' ? `${key}${sep}[redacted]` : '[redacted]'))
  return out.slice(0, 200)
}

export const statusOf = (err: unknown): number | null => {
  const e = err as { response?: { status?: unknown }; status?: unknown } | null
  const s = e?.response?.status ?? e?.status
  return typeof s === 'number' ? s : null
}

// The only error the vendored client lets out of a failed token refresh: status and a scrubbed message, nothing else.
export class GarminConnectError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message)
    this.name = 'GarminConnectError'
  }
}

export function safeError(err: unknown, secrets: (string | null | undefined)[] = []): GarminConnectError {
  if (err instanceof GarminConnectError) return err
  const message = scrub(String((err as { message?: unknown } | null)?.message ?? 'unknown error'), secrets)
  return new GarminConnectError(message, statusOf(err))
}

// One line, fixed label: never the error object (util.inspect would print its config and headers).
export function logSafe(label: string, err: unknown, secrets: (string | null | undefined)[] = []) {
  const e = safeError(err, secrets)
  console.error(`[garmin-connect] ${label}${e.status != null ? ` (HTTP ${e.status})` : ''}: ${e.message}`)
}
