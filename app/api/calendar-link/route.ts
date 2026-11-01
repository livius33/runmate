import { NextResponse } from 'next/server'
import { getLinkToken, rotateLinkToken } from '@/lib/links/tokens'
import { appHost } from '@/lib/app-host'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const link = (req: Request, token: string | null) => (token ? `${appHost(req)}/api/calendar/${token}.ics` : null)

// Behind Clerk: show or (re)create this user's private calendar link.
export const GET = withUser(async (req: Request) => {
  return NextResponse.json({ path: link(req, await getLinkToken('calendar')) })
})

export const POST = withUser(async (req: Request) => {
  return NextResponse.json({ path: link(req, await rotateLinkToken('calendar')) })
})
