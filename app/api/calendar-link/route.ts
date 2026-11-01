import { NextResponse } from 'next/server'
import { getCalendarToken, rotateCalendarToken } from '@/lib/calendar/token'
import { appHost } from '@/lib/app-host'

export const runtime = 'nodejs'

const link = (req: Request, token: string | null) => (token ? `${appHost(req)}/api/calendar/${token}.ics` : null)

// Behind Clerk: show or (re)create the private calendar link.
export async function GET(req: Request) {
  return NextResponse.json({ path: link(req, await getCalendarToken()) })
}

export async function POST(req: Request) {
  return NextResponse.json({ path: link(req, await rotateCalendarToken()) })
}
