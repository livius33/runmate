import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadOverrides, saveOverrides } from '@/lib/plan/load'
import { SavedOverrides, daysOutsidePlan, outsidePlanError, saveError } from '@/lib/plan/override-schema'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'
import { todayLocal } from '@/lib/dates'

const Body = z.object({ overrides: SavedOverrides })

// Plan edits made on the home page (moved sessions, carried-over km, rebalancing).
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json({ overrides: await loadOverrides() })
})

export const PUT = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: saveError(parsed.error.issues) }, { status: 400 })
  // Only days the plan covers (or the editor reaches); edits stored before pass unchanged. Nothing is dropped silently.
  const outside = daysOutsidePlan(parsed.data.overrides, await loadOverrides(), todayLocal())
  if (outside.length) return NextResponse.json({ error: outsidePlanError(outside) }, { status: 400 })
  await saveOverrides(parsed.data.overrides)
  return NextResponse.json({ ok: true })
})
