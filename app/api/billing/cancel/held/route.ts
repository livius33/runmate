import { NextResponse } from 'next/server'
import { z } from 'zod'
import { billingEnabled } from '@/lib/billing/config'
import { resolveHeld } from '@/lib/billing/cancel-form'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const Body = z.object({ action: z.enum(['confirm', 'discard']) })

// Form requests held after a take-back (lib/billing/cancel-form.ts): the signed-in owner confirms or discards them.
export const POST = withUser(async (req: Request) => {
  if (!billingEnabled()) return NextResponse.json({ error: 'Kein Abo auf dieser Installation.' }, { status: 404 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  const r = await resolveHeld(parsed.data.action)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
})
