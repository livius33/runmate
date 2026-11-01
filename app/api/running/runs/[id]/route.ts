import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { loadPlan } from '@/lib/plan/load'
import { RUN_TYPES } from '@/lib/analytics/run-metrics'
import { RUN_ACTIVITY_TYPES, parseMetrics, runSummary, toDatedRun } from '@/lib/analytics/run-view'
import { matchSessionRuns } from '@/lib/plan/pace-check'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { NOTE_MAX, RPE_MAX, RPE_MIN, withEntry, type Feel } from '@/lib/feedback/run'
import { loadRunFeedback, saveRunFeedback } from '@/lib/feedback/run-store'

type Params = { params: Promise<{ id: string }> }
type Series = (number | null)[]

const parse = (json: string | null | undefined): Series | null => {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

export async function GET(_req: Request, { params }: Params) {
  await ensureLiveBlocks()
  try {
    const { id } = await params
    const [row] = await db.select().from(activities).where(eq(activities.id, id)).limit(1)
    if (!row) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })
    const [st] = await db.select().from(activityStreams).where(eq(activityStreams.activityId, id)).limit(1)

    const run = runSummary(row)
    const metrics = parseMetrics(row)
    const all = await db.select().from(activities).where(inArray(activities.type, RUN_ACTIVITY_TYPES))

    // The session this run belongs to — swap-aware: a run can stand in for the day before or after.
    const dayMs = 86_400_000
    const near = (await loadPlan()).filter((s) => s.type !== 'rest' && Math.abs(Date.parse(s.date) - Date.parse(row.date)) <= dayMs)
    const nearDates = new Set([...near.map((s) => s.date), row.date])
    const paired = [...matchSessionRuns(near, all.filter((r) => nearDates.has(r.date)).map(toDatedRun))]
      .find(([, r]) => r?.id === row.id)
    const planned = (paired ? near.find((s) => s.date === paired[0]) : near.find((s) => s.date === row.date)) ?? null
    const plannedDate = planned?.date ?? null

    // ── Chart series: pace over a rolling 60 s window, downsampled to ≤ 300 points
    const dist = parse(st?.distanceJson), mv = parse(st?.movingJson), hr = parse(st?.heartrateJson)
    const alt = parse(st?.altitudeJson), cad = parse(st?.cadenceJson), temp = parse(st?.temperatureJson)
    const ll = st?.latlngJson ? (JSON.parse(st.latlngJson) as ([number, number] | null)[]) : null
    const paceAt: (number | null)[] = []
    if (dist && mv) {
      let j = 0
      for (let i = 0; i < dist.length; i++) {
        if (dist[i] == null || mv[i] == null) { paceAt.push(null); continue }
        while (j < i && (mv[j] == null || dist[j] == null || mv[i]! - mv[j]! > 60)) j++
        const w = mv[i]! - (mv[j] ?? mv[i]!), d = dist[i]! - (dist[j] ?? dist[i]!)
        paceAt.push(w >= 20 && d > 5 ? Math.round(w / (d / 1000)) : null)
      }
    }
    const series: { km: number; pace: number | null; hr: number | null; alt: number | null; cad: number | null }[] = []
    if (dist) {
      const step = Math.max(1, Math.ceil(dist.length / 300))
      for (let i = 0; i < dist.length; i += step) {
        if (dist[i] == null) continue
        series.push({
          km: Math.round(dist[i]! / 10) / 100,
          pace: paceAt[i] ?? null,
          hr: hr?.[i] ?? null,
          alt: alt?.[i] != null ? Math.round(alt[i]! * 10) / 10 : null,
          cad: cad?.[i] ?? null,
        })
      }
    }

    // ── Route with pace per point, ≤ 600 points
    let route: [number, number, number | null][] | null = null
    if (ll && ll.some(Boolean)) {
      const step = Math.max(1, Math.ceil(ll.length / 600))
      route = []
      for (let i = 0; i < ll.length; i += step) { const p = ll[i]; if (p) route.push([p[0], p[1], paceAt[i] ?? null]) }
    }

    const temps = (temp ?? []).filter((t): t is number => t != null)
    const temperature = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null

    // ── Comparison: same type, distance within ±20 %
    const similar = all
      .map(runSummary)
      .filter((r) => r.runType === run.runType && Math.abs(r.km - run.km) <= run.km * 0.2 && r.effMpb != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ id: r.id, date: r.date, km: r.km, paceS: r.paceS, hr: r.hr, effMpb: r.effMpb }))

    // Feedback (07-25): RPE from the row, Gefühl/Schmerzen/Notiz from settings 'run_feedback'.
    const fb = (await loadRunFeedback()).byActivity[row.id]
    const feedback = { rpe: row.perceivedExertion ?? null, feel: fb?.feel ?? null, pain: fb?.pain ?? null, note: fb?.note ?? null, at: fb?.at ?? null }

    return NextResponse.json({ run, garminActivityId: row.garminActivityId, metrics, planned, plannedDate, temperature, series, route, similar, feedback })
  } catch (err: any) {
    console.error('[run GET]', err.message)
    return NextResponse.json({ error: 'Lauf konnte nicht geladen werden' }, { status: 500 })
  }
}

const Patch = z.object({
  runType: z.enum(RUN_TYPES as [string, ...string[]]).nullable().optional(),
  rpe: z.number().int().min(RPE_MIN).max(RPE_MAX).nullable().optional(),
  feel: z.number().int().min(1).max(5).nullable().optional(),
  pain: z.enum(['none', 'light', 'stop']).nullable().optional(),
  note: z.string().max(NOTE_MAX).nullable().optional(),
}).refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'leer' })

// Correct the detected run type (null = back to automatic), or save feedback (07-25): rpe → activities.perceived_exertion,
// feel/pain/note → settings 'run_feedback' (an entry needs a Gefühl; null clears a field).
export async function PATCH(req: Request, { params }: Params) {
  await ensureLiveBlocks()
  const { id } = await params
  const body = Patch.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const b = body.data
  const [row] = await db.select({ id: activities.id }).from(activities).where(eq(activities.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })

  const set: Partial<typeof activities.$inferInsert> = {}
  if (b.runType !== undefined) set.runTypeOverride = b.runType
  if (b.rpe !== undefined) set.perceivedExertion = b.rpe
  if (b.feel !== undefined || b.pain !== undefined || b.note !== undefined) {
    const next = withEntry(await loadRunFeedback(), id, { feel: b.feel as Feel | null | undefined, pain: b.pain, note: b.note }, new Date().toISOString())
    if (!next) return NextResponse.json({ error: 'Erst das Gefühl wählen' }, { status: 400 })
    await saveRunFeedback(next)
  }
  if (Object.keys(set).length) await db.update(activities).set(set).where(eq(activities.id, id))
  return NextResponse.json({ ok: true })
}
