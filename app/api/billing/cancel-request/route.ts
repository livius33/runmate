import { NextResponse } from 'next/server'
import { z } from 'zod'
import { billingEnabled } from '@/lib/billing/config'
import { cancelCurrent } from '@/lib/billing/cancel'
import { setSettingJson } from '@/lib/db/settings'
import { runAsUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  kind: z.enum(['ordentlich', 'ausserordentlich']).default('ordentlich'),
  reason: z.string().trim().max(1000).optional(),
})

// The cancellation page without a session (§312k BGB: reachable without logging in). The contract is found by the
// account's email at Clerk; the answer is the same whether or not one exists (no account probing). Public in
// middleware.ts.
export async function POST(req: Request) {
  if (!billingEnabled()) return new NextResponse('Not found', { status: 404 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bitte Name und die E-Mail-Adresse deines Runmate-Kontos angeben.' }, { status: 400 })
  const at = Math.floor(Date.now() / 1000)
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const users = await (await clerkClient()).users.getUserList({ emailAddress: [parsed.data.email], limit: 1 })
    const userId = users.data[0]?.id
    if (userId) {
      await runAsUser(userId, async () => {
        const r = await cancelCurrent('next_billing_period')
        if (!r.ok) throw new Error('paddle')
        await setSettingJson('billing_cancellation', { kind: parsed.data.kind, reason: parsed.data.reason, name: parsed.data.name, at, endsAt: 'endsAt' in r ? r.endsAt : null, viaForm: true })
      }, { profile: null })
    }
  } catch (err: any) {
    console.error('[billing/cancel-request] failed:', err?.message)
    return NextResponse.json({ error: 'Die Kündigung konnte gerade nicht verarbeitet werden. Bitte versuche es gleich noch einmal oder schreib uns (Kontakt im Impressum).' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, at })
}
