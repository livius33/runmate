import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { isCrossType, isManualId, parseCrossEntry, parseRpe } from '@/lib/analytics/cross-training'
import { crossSummary } from '@/lib/analytics/cross-view'
import { todayInHamburg } from '@/lib/dates'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

async function load(id: string) {
  const [row] = await db.select().from(activities).where(eq(activities.id, id)).limit(1)
  return row && isCrossType(row.type) ? row : null          // run rows are never touched here
}

// { rpe } for any cross-training row; { minutes, date, sport, name } (plus rpe) for manual rows only.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params
  const row = await load(id)
  if (!row) return NextResponse.json({ error: 'Einheit nicht gefunden' }, { status: 404 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON-Objekt erwartet' }, { status: 400 })

  const rpeOnly = Object.keys(body).every((k) => k === 'rpe')
  let set: Partial<typeof activities.$inferInsert>
  if (rpeOnly) {
    const r = parseRpe(body.rpe)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    set = { perceivedExertion: r.rpe }
  } else {
    if (!isManualId(id)) return NextResponse.json({ error: 'Bei Garmin-Einheiten lässt sich nur die RPE ändern' }, { status: 409 })
    const parsed = parseCrossEntry({
      date: body.date ?? row.date, sport: body.sport ?? row.type, minutes: body.minutes ?? Math.round(row.durationS / 60),
      rpe: 'rpe' in body ? body.rpe : row.perceivedExertion, name: body.name ?? row.name,
    }, todayInHamburg())
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const e = parsed.entry
    set = { date: e.date, type: e.type, durationS: e.minutes * 60, elapsedTimeS: e.minutes * 60, perceivedExertion: e.rpe, name: e.name }
  }
  try {
    await db.update(activities).set(set).where(eq(activities.id, id))
    const [saved] = await db.select().from(activities).where(eq(activities.id, id)).limit(1)
    return NextResponse.json(crossSummary(saved))
  } catch (err: any) {
    console.error('[cross-training PATCH]', err.message)
    return NextResponse.json({ error: 'Änderung konnte nicht gespeichert werden' }, { status: 500 })
  }
}

// Manual rows only; Garmin rows come back with the next sync anyway.
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params
  const row = await load(id)
  if (!row) return NextResponse.json({ error: 'Einheit nicht gefunden' }, { status: 404 })
  if (!isManualId(id)) return NextResponse.json({ error: 'Garmin-Einheiten lassen sich hier nicht löschen' }, { status: 409 })
  try {
    await db.delete(activities).where(eq(activities.id, id))
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[cross-training DELETE]', err.message)
    return NextResponse.json({ error: 'Einheit konnte nicht gelöscht werden' }, { status: 500 })
  }
}
