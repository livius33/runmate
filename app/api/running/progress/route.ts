import { NextResponse } from 'next/server'
import { and, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { RUN_ACTIVITY_TYPES, effectiveType, parseMetrics } from '@/lib/analytics/run-view'
import { blockProgress, type BlockProgress, type ProgressRun } from '@/lib/analytics/progress'
import { activeBlock, blocks } from '@/lib/plan/blocks'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { loadPlan } from '@/lib/plan/load'
import { todayInHamburg } from '@/lib/dates'

export interface ProgressResponse {
  block: { id: string; name: string; shortName: string; planStart: string; end: string; raceDate: string }
  progress: BlockProgress
}

// Fortschritt im Block (07-27): ?block=<id> (default: the active block). Read-only; the numbers come from
// lib/analytics/progress.ts, the plan from loadPlan() (history + blocks + edits + engine + pauses).
export async function GET(req: Request) {
  await ensureLiveBlocks()
  try {
    const today = todayInHamburg()
    const id = new URL(req.url).searchParams.get('block')
    const block = (id && blocks().find((b) => b.id === id)) || activeBlock(today)
    const from = block.weeks[0]?.start ?? block.planStart, to = block.weeks[block.weeks.length - 1]?.end ?? block.end
    const [sessions, rows] = await Promise.all([
      loadPlan(),
      db.select().from(activities).where(and(inArray(activities.type, RUN_ACTIVITY_TYPES), gte(activities.date, from), lte(activities.date, to))),
    ])
    const runs: ProgressRun[] = rows.map((r) => {
      const m = parseMetrics(r)
      return {
        id: r.id, date: r.date, km: Math.round(r.distanceM / 100) / 10, paceS: r.averagePaceSPerKm, avgHr: r.averageHr,
        type: effectiveType(r, m),
        splits: (m?.splits ?? []).map((s) => ({ km: s.km, distM: s.distM, paceS: s.paceS, hr: s.hr, gainM: s.gainM })),
      }
    })
    const out: ProgressResponse = {
      block: { id: block.id, name: block.race.name, shortName: block.race.shortName, planStart: block.planStart, end: block.end, raceDate: block.race.date },
      progress: blockProgress({ block, sessions, runs, today }),
    }
    return NextResponse.json(out)
  } catch (err: any) {
    console.error('[progress GET]', err.message)
    return NextResponse.json({ error: 'Fortschritt konnte nicht geladen werden' }, { status: 500 })
  }
}
