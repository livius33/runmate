import { NextResponse } from 'next/server'
import { getSetting, setSetting } from '@/lib/db/settings'
import { todayLocal } from '@/lib/dates'
import { blocks } from '@/lib/plan/blocks'
import { BASE_KEY, ensureLiveBlocks, parseBase } from '@/lib/plan/live-blocks'
import type { BaseSettings } from '@/lib/plan/base-block'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Rolling base block (07-17): its settings and the base weeks from this week on.
async function state() {
  const value = await getSetting(BASE_KEY)
  const today = todayLocal()
  const weeks = blocks().filter((b) => b.base).flatMap((b) => b.weeks).filter((w) => w.end >= today)
  return { settings: parseBase(value ?? undefined), weeks }
}

export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json(await state())
})

// { paused?, capKm? } → saved; capKm null = no own cap (the proven volume still caps)
export const PUT = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const b = (await req.json().catch(() => null)) as Partial<BaseSettings> | null
  if (!b) return NextResponse.json({ error: 'Einstellungen fehlen.' }, { status: 400 })
  const old = parseBase((await getSetting(BASE_KEY)) ?? undefined)
  const capKm = b.capKm === undefined ? old.capKm : b.capKm
  if (capKm != null && (typeof capKm !== 'number' || !Number.isFinite(capKm) || capKm < 30 || capKm > 200)) {
    return NextResponse.json({ error: 'Deckel: 30–200 km pro Woche oder leer.' }, { status: 400 })
  }
  const value = JSON.stringify({ v: 1, paused: typeof b.paused === 'boolean' ? b.paused : old.paused, capKm, ...(old.start ? { start: old.start } : {}) } satisfies BaseSettings)
  await setSetting(BASE_KEY, value)
  await ensureLiveBlocks(true)              // re-register with the new settings
  return NextResponse.json(await state())
})
