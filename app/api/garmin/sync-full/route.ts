import { NextResponse } from 'next/server'
import { syncGarminActivitiesPage } from '@/lib/api-clients/garmin'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const page = Number(body.page ?? 0)
    const { inserted, updated, hasMore } = await syncGarminActivitiesPage(page, 50)
    return NextResponse.json({ ok: true, page, inserted, updated, hasMore })
  } catch (err: any) {
    console.error('[garmin/sync-full]', err)
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 })
  }
}
