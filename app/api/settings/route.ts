import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { inArray, sql } from 'drizzle-orm'

const STRAVA_KEYS = ['strava_client_id', 'strava_client_secret', 'strava_redirect_uri']

export async function GET() {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, STRAVA_KEYS))
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return NextResponse.json({
      stravaClientId: map['strava_client_id'] ?? process.env.STRAVA_CLIENT_ID ?? '',
      stravaRedirectUri: map['strava_redirect_uri'] ?? process.env.STRAVA_REDIRECT_URI ?? '',
      hasSecret: !!(map['strava_client_secret'] ?? process.env.STRAVA_CLIENT_SECRET),
    })
  } catch (err: any) {
    console.error('[settings GET]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const pairs: { key: string; value: string }[] = []

    if (body.stravaClientId !== undefined)
      pairs.push({ key: 'strava_client_id', value: String(body.stravaClientId) })
    if (body.stravaClientSecret !== undefined && body.stravaClientSecret !== '')
      pairs.push({ key: 'strava_client_secret', value: String(body.stravaClientSecret) })
    if (body.stravaRedirectUri !== undefined)
      pairs.push({ key: 'strava_redirect_uri', value: String(body.stravaRedirectUri) })

    for (const pair of pairs) {
      await db
        .insert(settings)
        .values({ key: pair.key, value: pair.value })
        .onConflictDoUpdate({ target: settings.key, set: { value: pair.value } })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[settings PUT]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
