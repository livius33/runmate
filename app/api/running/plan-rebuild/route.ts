// Rebuild of a live generated block (v1.1 10-02): GET = the block, its levers, the data check and the history;
// POST preview (free, writes nothing) | apply (Plus: `rebuild`) | undo (free).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { todayLocal } from '@/lib/dates'
import { PLUS_REQUIRED } from '@/lib/billing/access'
import { validProfile, type AthleteProfile } from '@/lib/plan/athlete-profile'
import { applyRebuild, previewRebuild, rebuildState, undoRebuild } from '@/lib/plan/rebuild-store'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Change = z.object({
  blockId: z.string().min(1).max(80).optional(),
  goalS: z.number().int().min(600).max(21600).optional(),
  raceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  templateId: z.string().min(1).max(80).optional(),
  currentKm: z.number().min(5).max(300).optional(),
  peakKm: z.number().min(10).max(300).nullable().optional(),
  profile: z.unknown().optional(),
})
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), change: Change }),
  z.object({ action: z.literal('apply'), change: Change }),
  z.object({ action: z.literal('undo'), id: z.string().min(1).max(40) }),
])

const fail = (r: { error: string; code?: string; needs?: string }) =>
  NextResponse.json({ error: r.error, code: r.code, needs: r.needs }, { status: r.code === PLUS_REQUIRED ? 402 : 400 })

export const GET = withUser(async (req: Request) => {
  const blockId = new URL(req.url).searchParams.get('block') ?? undefined
  return NextResponse.json(await rebuildState(todayLocal(), blockId))
})

export const POST = withUser(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const today = todayLocal()
  if (parsed.data.action === 'undo') {
    const r = await undoRebuild(parsed.data.id, today)
    return 'error' in r ? fail(r) : NextResponse.json(r)
  }
  const { profile, ...change } = parsed.data.change
  if (profile != null && !validProfile(profile)) return NextResponse.json({ error: 'Profil unvollständig' }, { status: 400 })
  const input = { ...change, ...(profile != null ? { profile: profile as AthleteProfile } : {}) }
  const r = parsed.data.action === 'preview' ? await previewRebuild(input, today) : await applyRebuild(input, today)
  return 'error' in r ? fail(r) : NextResponse.json(r)
})
