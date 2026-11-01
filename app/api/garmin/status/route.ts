import { NextResponse } from 'next/server'
import { garminAccountStatus } from '@/lib/garmin/account'
import { loadLastSync } from '@/lib/garmin/sync-job'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// Whether this user has Garmin set up and when it last synced; never the credentials themselves.
export const GET = withUser(async () => {
  const [status, lastSync] = await Promise.all([garminAccountStatus(), loadLastSync()])
  return NextResponse.json({ ...status, lastSync })
})
