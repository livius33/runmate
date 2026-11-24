// Cross-site request check for the middleware (12-04). Today CSRF protection rests on Clerk's session cookie being
// SameSite=Lax; with APP_HOST set, a state-changing request whose Origin is another site is refused as well. Without
// APP_HOST (self-host, local dev) nothing changes. Edge-safe: no Node imports.

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const clean = (host: string | undefined) => host?.trim().toLowerCase() || null

// Clerk's authorizedParties: the origins a session token may have been issued on (its `azp` claim): the public host and
// the host serving this request (a preview deployment). Unset without APP_HOST, so local keyless dev and self-hosts
// behind any host keep working.
export function authorizedParties(requestOrigin: string, appHost = process.env.APP_HOST): string[] | undefined {
  const host = clean(appHost)
  return host ? [...new Set([`https://${host}`, requestOrigin])] : undefined
}

// True when a browser sent this state-changing request from another site. No Origin header (curl, the iOS Shortcut,
// server-to-server) is not a browser's cross-site request and passes; the literal 'null' origin (sandboxed frames,
// some redirects) does not. The request's own host counts as ours, so preview deployments keep working.
export function foreignOrigin(req: Request, appHost = process.env.APP_HOST): boolean {
  const host = clean(appHost)
  if (!host || !STATE_CHANGING.has(req.method.toUpperCase())) return false
  const origin = req.headers.get('origin')
  if (!origin) return false
  let from: string
  try { from = new URL(origin).host.toLowerCase() } catch { return true }
  const ours = new Set([host, new URL(req.url).host.toLowerCase(), clean(req.headers.get('x-forwarded-host') ?? undefined)])
  return !ours.has(from)
}
