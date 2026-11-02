import { NextResponse } from 'next/server'
import { z } from 'zod'
import { acceptSuggestion } from '@/lib/plan/engine-store'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const Body = z.object({ key: z.string().min(1).max(200), decline: z.boolean().optional() })

// Without Plus the engine only suggests (lib/plan/engine-store.ts): { key } takes one suggestion over, { key, decline }
// rejects it. Both are the runner's own decision, so they are open to every plan.
export const POST = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  try {
    const r = await acceptSuggestion(parsed.data.key, parsed.data.decline ?? false)
    if ('error' in r) return NextResponse.json(r, { status: 409 })
    return NextResponse.json(r)
  } catch (err: any) {
    console.error('[plan-engine suggestion]', err.message)
    return NextResponse.json({ error: 'Vorschlag konnte nicht gespeichert werden' }, { status: 500 })
  }
})
