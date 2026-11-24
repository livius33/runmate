import { NextRequest, NextResponse } from 'next/server'
import { billingEnabled } from '@/lib/billing/config'
import { reconcileAll } from '@/lib/billing/reconcile'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUDGET_MS = 50_000         // stop starting new rows here; the rest follow the next night

// Daily (12-05): every subscription row that is not final is compared with Paddle and the difference applied; deleted
// accounts whose cancel failed are cancelled (lib/billing/reconcile.ts). The response lists counts only.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!billingEnabled()) return NextResponse.json({ ok: true, billing: false })
  const report = await reconcileAll(Date.now() + BUDGET_MS)
  return NextResponse.json({ ok: true, ...report })
}
