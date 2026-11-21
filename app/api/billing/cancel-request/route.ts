import { NextResponse } from 'next/server'
import { z } from 'zod'
import { billingEnabled } from '@/lib/billing/config'
import { handleFormRequest, sendCancellationMail, type FormOutcome } from '@/lib/billing/cancel-form'
import { runAsUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  kind: z.enum(['ordentlich', 'ausserordentlich']).default('ordentlich'),
  reason: z.string().trim().max(1000).optional(),
})

// The cancellation page without a session (§312k BGB: reachable without logging in). The contract is found by the
// account's email at Clerk; what happens then (cancel at period end, held after a take-back, dropped inside 24 hours)
// is lib/billing/cancel-form.ts. The answer is the same for every outcome and for unknown addresses (no account
// probing); only a failure at Paddle or Clerk answers 502. Public in middleware.ts.
export async function POST(req: Request) {
  if (!billingEnabled()) return new NextResponse('Not found', { status: 404 })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bitte Name und die E-Mail-Adresse deines Runmate-Kontos angeben.' }, { status: 400 })
  const at = Math.floor(Date.now() / 1000)
  let userId: string | undefined
  let outcome: FormOutcome | 'no-account' = 'no-account'
  let subscriptionId: string | null = null
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const users = await (await clerkClient()).users.getUserList({ emailAddress: [parsed.data.email], limit: 1 })
    userId = users.data[0]?.id
    if (userId) {
      const { name, kind, reason } = parsed.data
      const r = await runAsUser(userId, () => handleFormRequest({ name, kind, ...(reason ? { reason } : {}) }, at), { profile: null })
      outcome = r.outcome
      subscriptionId = r.subscriptionId
    }
  } catch (err: any) {
    outcome = 'failed'
    console.error('[billing/cancel-request] user=%s failed: %s', userId ?? '-', err?.message)
  }
  // Ids only, never the address or the name.
  console.info('[billing/cancel-request] user=%s subscription=%s outcome=%s', userId ?? '-', subscriptionId ?? '-', outcome)
  if (userId && outcome !== 'no-account') await sendCancellationMail(userId, outcome, at).catch(() => {})
  if (outcome === 'failed') {
    return NextResponse.json({ error: 'Die Kündigung konnte gerade nicht verarbeitet werden. Bitte versuche es gleich noch einmal oder schreib uns (Kontakt im Impressum).' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, at })
}
