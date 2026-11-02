import { NextResponse } from 'next/server'
import { verifySvix } from '@/lib/account/svix'
import { deleteAccount } from '@/lib/account/delete'
import { runAsUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Clerk → Runmate (public in middleware.ts). `user.deleted` (a user deleted in Clerk's dashboard or their own Clerk
// profile) deletes all of that user's data here too, the same way as Settings → Konto löschen. Other events: 200.
export async function POST(req: Request) {
  const raw = await req.text()
  const ok = verifySvix(raw, { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') }, process.env.CLERK_WEBHOOK_SECRET)
  if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  let ev: { type?: string; data?: { id?: unknown } }
  try { ev = JSON.parse(raw) } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  if (ev.type !== 'user.deleted') return NextResponse.json({ ok: true, result: 'ignored' })
  const userId = ev.data?.id
  if (typeof userId !== 'string' || !/^[\w-]{1,100}$/.test(userId)) return NextResponse.json({ error: 'invalid user' }, { status: 400 })
  try {
    await runAsUser(userId, () => deleteAccount({ deleteClerkUser: false, strictBilling: false }), { profile: null })
    return NextResponse.json({ ok: true, result: 'deleted' })
  } catch (err: any) {
    console.error('[webhooks/clerk] deletion failed:', err?.message)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
