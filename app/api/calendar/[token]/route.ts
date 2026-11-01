import { addDays, format } from 'date-fns'
import { loadPlan } from '@/lib/plan/load'
import { buildIcs } from '@/lib/calendar/ics'
import { userForLinkToken } from '@/lib/links/tokens'
import { syncVersions } from '@/lib/calendar/versions'
import { timeZone, todayLocal } from '@/lib/dates'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { runAsUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAST_DAYS = 28   // keep the last four weeks visible; everything planned ahead

// Public (no Clerk session: calendar apps cannot log in) but only with the secret token, which names the user:
// /api/calendar/<token>.ics → that user's effective plan (base + engine + manual edits) as all-day events.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const userId = await userForLinkToken('calendar', token.replace(/\.ics$/, ''))
  if (!userId) return new Response('Not found', { status: 404 })
  return runAsUser(userId, async () => {
    await ensureLiveBlocks()
    const from = format(addDays(new Date(`${todayLocal()}T12:00:00Z`), -PAST_DAYS), 'yyyy-MM-dd')
    const sessions = (await loadPlan()).filter((s) => s.date >= from)
    const versions = await syncVersions(sessions)
    return new Response(buildIcs(sessions, new Date(), versions, timeZone()), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="runmate-training.ics"',
        'Cache-Control': 'no-store',
      },
    })
  })
}
