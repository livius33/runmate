import { addDays, format } from 'date-fns'
import { loadPlan } from '@/lib/plan/load'
import { buildIcs } from '@/lib/calendar/ics'
import { tokenMatches } from '@/lib/calendar/token'
import { syncVersions } from '@/lib/calendar/versions'
import { todayInHamburg } from '@/lib/dates'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAST_DAYS = 28   // keep the last four weeks visible; everything planned ahead

// Public (no Clerk session: calendar apps cannot log in) but only with the secret token:
// /api/calendar/<token>.ics → the effective plan (base + engine + manual edits) as all-day events.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  await ensureLiveBlocks()
  const { token } = await params
  if (!(await tokenMatches(token.replace(/\.ics$/, '')))) return new Response('Not found', { status: 404 })
  const from = format(addDays(new Date(`${todayInHamburg()}T12:00:00Z`), -PAST_DAYS), 'yyyy-MM-dd')
  const sessions = (await loadPlan()).filter((s) => s.date >= from)
  const versions = await syncVersions(sessions)
  return new Response(buildIcs(sessions, new Date(), versions), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="runmate-training.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
