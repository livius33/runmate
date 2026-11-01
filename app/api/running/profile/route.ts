import { NextResponse } from 'next/server'
import { todayInHamburg } from '@/lib/dates'
import { connections, loadProfile, profilePrefill, saveProfile, upcomingEvents } from '@/lib/plan/workshop-store'
import { validProfile } from '@/lib/plan/athlete-profile'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// { profile: saved or null, prefill: from Runmate's data (for the onboarding) }
export async function GET() {
  await ensureLiveBlocks()
  const today = todayInHamburg()
  const [profile, prefill, conn, events] = await Promise.all([loadProfile(), profilePrefill(today), connections(), upcomingEvents(today)])
  return NextResponse.json({ profile, prefill, connections: conn, events })
}

export async function PUT(req: Request) {
  await ensureLiveBlocks()
  const b = await req.json().catch(() => null)
  if (!validProfile(b?.profile)) return NextResponse.json({ error: 'Bitte alle Pflichtangaben prüfen (mindestens ein Trainingstag).' }, { status: 400 })
  await saveProfile(b.profile)
  return NextResponse.json({ ok: true })
}
