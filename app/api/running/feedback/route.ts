import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { gte, inArray, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { todayLocal } from '@/lib/dates'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import type { Feel, Pain } from '@/lib/feedback/run'
import { loadRunFeedback } from '@/lib/feedback/run-store'
import { loadWeekFeedback } from '@/lib/feedback/week-reader'
import { weekEntryFor } from '@/lib/feedback/rules'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface FeedbackByActivity {
  [id: string]: { date: string; rpe: number | null; feel?: Feel; pain?: Pain; note?: string; at?: string }
}

// Feedback of the last days (Heute card, run lists): RPE from the activity row, the rest from settings 'run_feedback',
// plus the weekly feedback entry the rules read (this week's, else last week's — 07-26 writes it).
export const GET = withUser(async (req: Request) => {
  const today = todayLocal()
  const q = new URL(req.url).searchParams
  const days = Math.min(365, Math.max(1, Number(q.get('days')) || 42))
  const since = format(addDays(parseISO(today), -days), 'yyyy-MM-dd')
  try {
    const [rows, store, weeks] = await Promise.all([
      db.select({ id: activities.id, date: activities.date, rpe: activities.perceivedExertion }).from(activities)
        .where(own(activities, gte(activities.date, since), inArray(activities.type, RUN_ACTIVITY_TYPES))),
      loadRunFeedback(),
      loadWeekFeedback(),
    ])
    const byActivity: FeedbackByActivity = {}
    for (const r of rows) {
      const e = store.byActivity[r.id]
      byActivity[r.id] = { date: r.date, rpe: r.rpe ?? null, ...(e ? { feel: e.feel, pain: e.pain, note: e.note, at: e.at } : {}) }
    }
    return NextResponse.json({ byActivity, week: weekEntryFor(weeks, today) })
  } catch (err: any) {
    console.error('[feedback GET]', err.message)
    return NextResponse.json({ error: 'Feedback konnte nicht geladen werden' }, { status: 500 })
  }
})
