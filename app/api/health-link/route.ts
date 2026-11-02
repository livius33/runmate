import { NextResponse } from 'next/server'
import { getLinkToken, rotateLinkToken } from '@/lib/links/tokens'
import { lastUpload } from '@/lib/health/store'
import { appHost } from '@/lib/app-host'
import { withUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'

const link = (req: Request, token: string | null) => (token ? `https://${appHost(req)}/api/health/${token}` : null)

// Behind Clerk: show or (re)create this user's private upload link, plus the last upload.
export const GET = withUser(async (req: Request) => {
  const [token, last] = await Promise.all([getLinkToken('health'), lastUpload()])
  return NextResponse.json({ url: link(req, token), last })
})

export const POST = withUser(async (req: Request) => {
  const blocked = await intakeBlocked()
  if (blocked) return blocked
  return NextResponse.json({ url: link(req, await rotateLinkToken('health')), last: await lastUpload() })
})
