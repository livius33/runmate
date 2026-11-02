import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteAccount } from '@/lib/account/delete'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const maxDuration = 60

const DELETE_PHRASE = 'LÖSCHEN'

// Art. 17 GDPR: cancel the subscription at once, delete all rows, delete the Clerk user. The typed phrase guards against
// a slip. Never gated by the plan.
export const POST = withUser(async (req: Request) => {
  const parsed = z.object({ confirm: z.literal(DELETE_PHRASE) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: `Zum Bestätigen „${DELETE_PHRASE}“ eingeben.` }, { status: 400 })
  try {
    const r = await deleteAccount({ deleteClerkUser: true, strictBilling: true })
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json(r, { status: 502 })
  } catch (err: any) {
    console.error('[account/delete] failed:', err?.message)
    return NextResponse.json({ error: 'Das Löschen ist fehlgeschlagen. Bitte versuche es noch einmal.' }, { status: 500 })
  }
})
