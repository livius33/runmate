import { NextResponse } from 'next/server'
import { getHealthToken, rotateHealthToken } from '@/lib/health/token'
import { lastUpload } from '@/lib/health/store'
import { appHost } from '@/lib/app-host'

export const runtime = 'nodejs'

const link = (req: Request, token: string | null) => (token ? `https://${appHost(req)}/api/health/${token}` : null)

// Behind Clerk: show or (re)create the private upload link, plus the last upload.
export async function GET(req: Request) {
  const [token, last] = await Promise.all([getHealthToken(), lastUpload()])
  return NextResponse.json({ url: link(req, token), last })
}

export async function POST(req: Request) {
  return NextResponse.json({ url: link(req, await rotateHealthToken()), last: await lastUpload() })
}
