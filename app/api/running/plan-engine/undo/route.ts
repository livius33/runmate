import { NextResponse } from 'next/server'
import { z } from 'zod'
import { undoAndSave } from '@/lib/plan/engine-store'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const runtime = 'nodejs'

const Body = z.object({ id: z.string().min(1).max(200) })

export async function POST(req: Request) {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  try {
    const r = await undoAndSave(parsed.data.id)
    if ('error' in r) return NextResponse.json(r, { status: 409 })
    return NextResponse.json(r)
  } catch (err: any) {
    console.error('[plan-engine undo]', err.message)
    return NextResponse.json({ error: 'Zurücknehmen fehlgeschlagen' }, { status: 500 })
  }
}
