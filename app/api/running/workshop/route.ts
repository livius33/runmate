import { NextResponse } from 'next/server'
import { todayInHamburg } from '@/lib/dates'
import { applySuggestion, undoWorkshop, workshop } from '@/lib/plan/workshop-store'
import type { PeriodChoice } from '@/lib/plan/workshop'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// ?p=event | 2w | 4w | 8w | range&from=YYYY-MM-DD&to=YYYY-MM-DD
function choiceOf(p: string | null, from: string | null, to: string | null): PeriodChoice | null {
  if (!p || p === 'event') return { kind: 'event' }
  const w = p.match(/^(\d{1,2})w$/)
  if (w) return { kind: 'weeks', weeks: Number(w[1]) }
  if (p === 'range' && from && to && DATE.test(from) && DATE.test(to)) return { kind: 'range', from, to }
  return null
}

export async function GET(req: Request) {
  await ensureLiveBlocks()
  const q = new URL(req.url).searchParams
  const choice = choiceOf(q.get('p'), q.get('from'), q.get('to'))
  if (!choice) return NextResponse.json({ error: 'Zeitraum: event, 2w, 4w oder range mit from/to' }, { status: 400 })
  const { input: _input, ...rest } = await workshop(choice, todayInHamburg())
  return NextResponse.json(rest)
}

// { action: 'apply', p, from?, to?, id } | { action: 'undo', entryId }
export async function POST(req: Request) {
  await ensureLiveBlocks()
  const b = await req.json().catch(() => null)
  const today = todayInHamburg()
  if (b?.action === 'apply' && typeof b.id === 'string') {
    const choice = choiceOf(b.p ?? null, b.from ?? null, b.to ?? null)
    if (!choice) return NextResponse.json({ error: 'Zeitraum fehlt' }, { status: 400 })
    const r = await applySuggestion(choice, b.id, today)
    return 'error' in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json(r)
  }
  if (b?.action === 'undo' && typeof b.entryId === 'string') {
    const r = await undoWorkshop(b.entryId, today)
    return 'error' in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json(r)
  }
  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 })
}
