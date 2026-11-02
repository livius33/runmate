import { NextResponse } from 'next/server'
import { demoEnabled } from '@/lib/demo/store'
import { demoRoute } from '@/lib/demo/routes'
import { isReadOnlyError, readOnlyResponse, runAsDemo } from '@/lib/demo/serve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
type Ctx = { params: Promise<{ path: string[] }> }

// The demo's API (Phase 5, only with DEMO_MODE=1): GETs of the allowlisted routes (lib/demo/routes.ts), run as the demo
// user in a read-only scope. The handler sees a fresh request without the visitor's cookies or headers.
export async function GET(req: Request, { params }: Ctx) {
  if (!demoEnabled()) return notFound()
  const { path } = await params
  const route = await demoRoute(path)
  if (!route) return notFound()
  const url = new URL(req.url)
  const inner = new Request(new URL(`/api/${path.join('/')}${url.search}`, url.origin), { headers: { accept: 'application/json' } })
  try {
    return await runAsDemo(async () => route.GET(inner, { params: Promise.resolve(route.params) }))
  } catch (err) {
    if (isReadOnlyError(err)) return readOnlyResponse()
    throw err
  }
}

// Nothing in the demo can be changed.
const refuse = async () => (demoEnabled() ? readOnlyResponse() : notFound())
export const POST = refuse
export const PUT = refuse
export const PATCH = refuse
export const DELETE = refuse
