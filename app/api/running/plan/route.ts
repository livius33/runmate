import { NextResponse } from 'next/server'
import { loadPlan } from '@/lib/plan/load'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

// The plan comes from the training blocks (lib/plan/blocks.ts); this endpoint only reads it.
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json(await loadPlan())
})
