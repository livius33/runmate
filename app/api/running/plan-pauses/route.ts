import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { loadPauses, savePauses } from '@/lib/plan/pause-store'
import { pauseError, type Pause } from '@/lib/plan/pause'
import { runAndSaveEngine } from '@/lib/plan/engine-store'
import { todayLocal } from '@/lib/dates'
import { withUser } from '@/lib/server/scope'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Create = z.object({ kind: z.enum(['krank', 'pause']), from: Day, to: Day.nullable() })
const Patch = z.object({ id: z.string().max(40), to: Day.nullable() })

// Krank/Pause periods (07-08). Every change re-runs the engine so the plan follows at once.
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json({ pauses: await loadPauses() })
})

async function save(next: Pause[], p: Pause) {
  const err = pauseError(p, next.filter((x) => x.id !== p.id), todayLocal())
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  await savePauses(next)
  await runAndSaveEngine()
  return NextResponse.json({ pauses: next })
}

export const POST = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const parsed = Create.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe.' }, { status: 400 })
  const p: Pause = { id: `p-${Date.now().toString(36)}`, ...parsed.data }
  return save([...(await loadPauses()), p], p)
})

export const PATCH = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const parsed = Patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe.' }, { status: 400 })
  const all = await loadPauses()
  const old = all.find((p) => p.id === parsed.data.id)
  if (!old) return NextResponse.json({ error: 'Pause nicht gefunden.' }, { status: 404 })
  const p = { ...old, to: parsed.data.to }
  return save(all.map((x) => (x.id === p.id ? p : x)), p)
})

export const DELETE = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const id = new URL(req.url).searchParams.get('id')
  const all = await loadPauses()
  if (!all.some((p) => p.id === id)) return NextResponse.json({ error: 'Pause nicht gefunden.' }, { status: 404 })
  const next = all.filter((p) => p.id !== id)
  await savePauses(next)
  await runAndSaveEngine()
  return NextResponse.json({ pauses: next })
})
