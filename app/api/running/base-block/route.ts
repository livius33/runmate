import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { todayInHamburg } from '@/lib/dates'
import { blocks } from '@/lib/plan/blocks'
import { BASE_KEY, ensureLiveBlocks, parseBase } from '@/lib/plan/live-blocks'
import type { BaseSettings } from '@/lib/plan/base-block'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Rolling base block (07-17): its settings and the base weeks from this week on.
async function state() {
  const [row] = await db.select().from(settings).where(eq(settings.key, BASE_KEY))
  const today = todayInHamburg()
  const weeks = blocks().filter((b) => b.base).flatMap((b) => b.weeks).filter((w) => w.end >= today)
  return { settings: parseBase(row?.value), weeks }
}

export async function GET() {
  await ensureLiveBlocks()
  return NextResponse.json(await state())
}

// { paused?, capKm? } → saved; capKm null = no own cap (the proven volume still caps)
export async function PUT(req: Request) {
  await ensureLiveBlocks()
  const b = (await req.json().catch(() => null)) as Partial<BaseSettings> | null
  if (!b) return NextResponse.json({ error: 'Einstellungen fehlen.' }, { status: 400 })
  const [row] = await db.select().from(settings).where(eq(settings.key, BASE_KEY))
  const old = parseBase(row?.value)
  const capKm = b.capKm === undefined ? old.capKm : b.capKm
  if (capKm != null && (typeof capKm !== 'number' || !Number.isFinite(capKm) || capKm < 30 || capKm > 200)) {
    return NextResponse.json({ error: 'Deckel: 30–200 km pro Woche oder leer.' }, { status: 400 })
  }
  const value = JSON.stringify({ v: 1, paused: typeof b.paused === 'boolean' ? b.paused : old.paused, capKm } satisfies BaseSettings)
  await db.insert(settings).values({ key: BASE_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  await ensureLiveBlocks(true)              // re-register with the new settings
  return NextResponse.json(await state())
}
