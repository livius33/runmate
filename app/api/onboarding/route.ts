import { NextResponse } from 'next/server'
import { withUser } from '@/lib/server/scope'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { applyOnboarding, onboardingView, type OnboardingRequest } from '@/lib/onboarding/store'
import { ALL_STEPS, type Step } from '@/lib/onboarding/flow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The onboarding (Phase 5): its state, the step to show and what the steps need to know.
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  return NextResponse.json(await onboardingView())
})

// { type: 'complete' | 'skip', step, profile? } | { type: 'back' } | { type: 'finish' } → the next state or a German error.
export const POST = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const b = (await req.json().catch(() => null)) as OnboardingRequest | null
  const stepOk = (x: unknown): x is Step => (ALL_STEPS as readonly unknown[]).includes(x)
  if (!b || !['complete', 'skip', 'back', 'finish'].includes(b.type) || ((b.type === 'complete' || b.type === 'skip') && !stepOk(b.step))) {
    return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  }
  const r = await applyOnboarding(b)
  if ('error' in r) return NextResponse.json(r, { status: 400 })
  return NextResponse.json({ ...(await onboardingView()), notes: r.notes })
})
