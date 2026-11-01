import { NextResponse } from 'next/server'
import { loadEngineState, runAndSaveEngine } from '@/lib/plan/engine-store'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const runtime = 'nodejs'

// The plan engine's changes and log.
export async function GET() {
  await ensureLiveBlocks()
  try {
    return NextResponse.json(await loadEngineState())
  } catch (err: any) {
    console.error('[plan-engine GET]', err.message)
    return NextResponse.json({ error: 'Plan-Anpassungen konnten nicht geladen werden' }, { status: 500 })
  }
}

// Run the engine now (Plan page load); returns the new state.
export async function POST() {
  await ensureLiveBlocks()
  try {
    return NextResponse.json(await runAndSaveEngine())
  } catch (err: any) {
    console.error('[plan-engine POST]', err.message)
    return NextResponse.json({ error: 'Plan-Anpassung fehlgeschlagen' }, { status: 500 })
  }
}
