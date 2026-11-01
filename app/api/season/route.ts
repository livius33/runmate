import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { todayInHamburg } from '@/lib/dates'
import { KINDS, SEASON_KEY, allGoals, isPlanGoalId, storedGoals, validateGoal, type SeasonGoal, type StoredSeason } from '@/lib/season/goals'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { blocks } from '@/lib/plan/blocks'
import { eventBlock, eventError } from '@/lib/plan/events'
import { runAndSaveEngine } from '@/lib/plan/engine-store'

export const runtime = 'nodejs'

const KEY = SEASON_KEY

const Goal = z.object({
  id: z.string().min(1).max(60).optional(),     // missing = new goal
  kind: z.enum(KINDS as [string, ...string[]]),
  priority: z.enum(['A', 'B']),
  name: z.string().trim().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confirmed: z.boolean(),
  distanceKm: z.number().positive().nullable(),
  goalS: z.number().int().nullable(),
  loops: z.number().int().nullable(),
  role: z.enum(['test', 'build', 'fun']).optional(),           // minor race in a generated block (07-16)
  paceS: z.number().int().nullable().optional(),
})

async function load(): Promise<SeasonGoal[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  let raw: unknown = null
  try { raw = row ? JSON.parse(row.value) : null } catch { /* ignore */ }
  return storedGoals(raw)
}

// Saves, then re-registers the blocks with their minor races and re-runs the engine so the plan follows at once.
async function store(goals: SeasonGoal[]) {
  const value = JSON.stringify({ v: 2, goals } satisfies StoredSeason)
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  await ensureLiveBlocks(true)
  await runAndSaveEngine()
}

const readonly = (id: string) => isPlanGoalId(id)

// Season: plan-file races, plan events and own races/runs (same on every device).
export async function GET() {
  await ensureLiveBlocks()
  return NextResponse.json({ goals: allGoals(await load()) })
}

// Create (no id) or update a race or run.
export async function PUT(req: Request) {
  await ensureLiveBlocks()
  const parsed = z.object({ goal: Goal }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const own = await load()
  const input = parsed.data.goal
  if (input.id && readonly(input.id)) return NextResponse.json({ error: 'Das steht im Trainingsplan und lässt sich hier nicht ändern.' }, { status: 400 })
  if (input.id && !own.some((g) => g.id === input.id)) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  const goal = { ...input, id: input.id ?? `goal-${Date.now().toString(36)}` } as SeasonGoal

  const block = eventBlock(goal, blocks())
  const error = validateGoal(goal, allGoals(own), todayInHamburg()) ?? (block && eventError(goal, block))
  if (error) return NextResponse.json({ error }, { status: 400 })
  const next = [...own.filter((g) => g.id !== goal.id), goal]
  await store(next)
  return NextResponse.json({ goals: allGoals(next) })
}

// Delete a race or run: DELETE /api/season?id=…
export async function DELETE(req: Request) {
  await ensureLiveBlocks()
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (readonly(id)) return NextResponse.json({ error: 'Das steht im Trainingsplan und lässt sich hier nicht löschen.' }, { status: 400 })
  const own = await load()
  if (!own.some((g) => g.id === id)) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
  const next = own.filter((g) => g.id !== id)
  await store(next)
  return NextResponse.json({ goals: allGoals(next) })
}
