import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadOverrides, saveOverrides } from '@/lib/plan/load'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

const Session = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['easy', 'tempo', 'long', 'intervals', 'rest', 'race', 'recovery']),
  km: z.number().min(0).max(60).optional(),
  title: z.string().max(120),
  notes: z.string().max(1000).optional(),
  pace: z.string().max(10).optional(),
  key: z.boolean().optional(),
})
const Body = z.object({
  overrides: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), Session),
})

// Plan edits made on the home page (moved sessions, carried-over km, rebalancing).
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json({ overrides: await loadOverrides() })
})

export const PUT = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid overrides' }, { status: 400 })
  await saveOverrides(parsed.data.overrides)
  return NextResponse.json({ ok: true })
})
