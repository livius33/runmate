import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { todayInHamburg } from '@/lib/dates'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { planWeeks } from '@/lib/plan/effective'
import { feedbackEntry, loadWeekFeedback, saveWeekFeedback, weekError, NOTE_MAX, Ymd, type Score } from '@/lib/feedback/week'

const score = z.number().int().min(1).max(5)
const Body = z.object({
  week: Ymd,
  rating: score,
  fatigue: score,
  note: z.string().max(NOTE_MAX).nullable().optional(),
})

// Per-run feel (settings 'run_feedback', owned by 07-25) — read only, so the overlay can show "Gefühl dieser Woche".
export interface RunFeel { feel: number; pain: 'none' | 'light' | 'stop' }
const RunFeelSchema = z.object({ feel: z.number().int().min(1).max(5), pain: z.enum(['none', 'light', 'stop']) })
async function loadRunFeel(): Promise<Record<string, RunFeel>> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'run_feedback'))
    if (!row) return {}
    const by = (JSON.parse(row.value) as { byActivity?: Record<string, unknown> })?.byActivity ?? {}
    const out: Record<string, RunFeel> = {}
    for (const [id, v] of Object.entries(by)) { const p = RunFeelSchema.safeParse(v); if (p.success) out[id] = p.data }
    return out
  } catch { return {} }
}

// Weekly feedback (07-26): GET everything stored (+ per-run feel), PUT one week's rating.
export async function GET() {
  await ensureLiveBlocks()
  const [feedback, runs] = await Promise.all([loadWeekFeedback(), loadRunFeel()])
  return NextResponse.json({ ...feedback, runs })
}

export async function PUT(req: Request) {
  await ensureLiveBlocks()
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const msg = issue?.path[0] === 'note' ? `Die Notiz darf höchstens ${NOTE_MAX} Zeichen haben.`
      : issue?.path[0] === 'rating' || issue?.path[0] === 'fatigue' ? 'Bewertung und Müdigkeit brauchen einen Wert von 1 bis 5.'
      : 'Ungültige Eingabe.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  const { week, rating, fatigue, note } = parsed.data
  const err = weekError(week, todayInHamburg(), planWeeks())
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const entry = feedbackEntry({ rating: rating as Score, fatigue: fatigue as Score, note })
  const next = await saveWeekFeedback(week, entry)
  return NextResponse.json({ ...next, saved: entry })
}
