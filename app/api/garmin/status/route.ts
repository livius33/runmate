import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { garminTokens } from '@/lib/db/schema'
import { loadLastSync } from '@/lib/garmin/sync-job'

export const runtime = 'nodejs'

export async function GET() {
  const hasCreds = !!(process.env.GARMIN_USERNAME && process.env.GARMIN_PASSWORD)
  const [token] = await db.select().from(garminTokens).limit(1)

  return NextResponse.json({
    hasCredentials: hasCreds,
    hasSession: !!token,
    sessionUpdatedAt: token?.updatedAt ?? null,
    lastSync: await loadLastSync(),
  })
}
