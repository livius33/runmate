// The API routes the demo serves (Phase 5): GET only, an explicit allowlist of the routes the dashboard pages read.
// Everything else — account, billing, export, sources writes, cron, webhooks, secret links — is not reachable from
// /demo/api at all. Server only (imports the route modules).
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response
type RouteModule = { GET?: Handler }

const ROUTES: [pattern: string, load: () => Promise<unknown>][] = [
  ['cross-training', () => import('@/app/api/cross-training/route')],
  ['cross-training/load', () => import('@/app/api/cross-training/load/route')],
  ['feedback/week', () => import('@/app/api/feedback/week/route')],
  ['health-data', () => import('@/app/api/health-data/route')],
  ['profile', () => import('@/app/api/profile/route')],
  ['runner/profile', () => import('@/app/api/runner/profile/route')],
  ['running/analytics', () => import('@/app/api/running/analytics/route')],
  ['running/base-block', () => import('@/app/api/running/base-block/route')],
  ['running/drafts', () => import('@/app/api/running/drafts/route')],
  ['running/feedback', () => import('@/app/api/running/feedback/route')],
  ['running/fitness', () => import('@/app/api/running/fitness/route')],
  ['running/plan', () => import('@/app/api/running/plan/route')],
  ['running/plan-actuals', () => import('@/app/api/running/plan-actuals/route')],
  ['running/plan-engine', () => import('@/app/api/running/plan-engine/route')],
  ['running/plan-overrides', () => import('@/app/api/running/plan-overrides/route')],
  ['running/plan-pauses', () => import('@/app/api/running/plan-pauses/route')],
  ['running/profile', () => import('@/app/api/running/profile/route')],
  ['running/progress', () => import('@/app/api/running/progress/route')],
  ['running/race-analysis', () => import('@/app/api/running/race-analysis/route')],
  ['running/race-checklist', () => import('@/app/api/running/race-checklist/route')],
  ['running/runs', () => import('@/app/api/running/runs/route')],
  ['running/runs/[id]', () => import('@/app/api/running/runs/[id]/route')],
  ['running/stats', () => import('@/app/api/running/stats/route')],
  ['running/wellness', () => import('@/app/api/running/wellness/route')],
  ['running/workshop', () => import('@/app/api/running/workshop/route')],
  ['season', () => import('@/app/api/season/route')],
  ['sources', () => import('@/app/api/sources/route')],
]
export const DEMO_API_ROUTES = ROUTES.map(([p]) => p)

const SEGMENT = /^[\w.-]{1,80}$/

// /demo/api/<path> → the route's GET and its dynamic params, or null (not served).
export async function demoRoute(path: string[]): Promise<{ GET: Handler; params: Record<string, string> } | null> {
  if (!path.length || !path.every((s) => SEGMENT.test(s))) return null
  for (const [pattern, load] of ROUTES) {
    const parts = pattern.split('/')
    if (parts.length !== path.length) continue
    const params: Record<string, string> = {}
    if (!parts.every((p, i) => (p.startsWith('[') ? ((params[p.slice(1, -1)] = path[i]), true) : p === path[i]))) continue
    const mod = (await load()) as RouteModule
    return mod.GET ? { GET: mod.GET, params } : null
  }
  return null
}
