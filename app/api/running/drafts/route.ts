import { NextResponse } from 'next/server'
import { todayLocal } from '@/lib/dates'
import { deleteDraft, goLive, listDrafts, planStatus, saveOwn, saveTuning, previewDraft, saveDraft, takeOffline, type DraftChoiceIn } from '@/lib/plan/draft-store'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// { goals, templates, defaultStart, profile, drafts: [{ draft, result }], live } — every draft regenerated
// ?status=1 → plan status per upcoming main race only (no drafts generated)
export const GET = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  if (new URL(req.url).searchParams.get('status')) return NextResponse.json(await planStatus(todayLocal()))
  return NextResponse.json(await listDrafts(todayLocal()))
})

// { goalId, templateId, start, overrides } → the generated draft (nothing saved);
// { action: 'live', draftId } → freeze it into the live plan; { action: 'offline', blockId } → remove it again;
// { action: 'tune', templateId, tuning } → save "Mein Ansatz" for that template
// { action: 'own', templateId, tuning, name } → save the own method for that base's distance (07-19)
export const POST = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const b = (await req.json().catch(() => null)) as (DraftChoiceIn & { action?: string; draftId?: string; blockId?: string; name?: string }) | null
  if (b?.action === 'own') {
    const r = await saveOwn(b.templateId ?? '', b.tuning ?? {}, typeof b.name === 'string' ? b.name : '')
    return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r)
  }
  if (b?.action === 'tune') {
    const r = await saveTuning(b.templateId ?? '', b.tuning ?? {})
    return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r)
  }
  if (b?.action === 'live' || b?.action === 'offline') {
    const r = b.action === 'live' ? await goLive(b.draftId ?? '', todayLocal()) : await takeOffline(b.blockId ?? '')
    return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r)
  }
  if (!b?.goalId || !b.templateId || !b.start) return NextResponse.json({ ok: false, error: 'Ziel, Vorlage und Start fehlen.' }, { status: 400 })
  return NextResponse.json(await previewDraft(b, todayLocal()))
})

// { draft: { id?, goalId, templateId, start, overrides } } → saved choices
export const PUT = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const b = (await req.json().catch(() => null)) as { draft?: DraftChoiceIn & { id?: string } } | null
  if (!b?.draft) return NextResponse.json({ error: 'Entwurf fehlt.' }, { status: 400 })
  const r = await saveDraft(b.draft, todayLocal())
  return 'error' in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r)
})

export const DELETE = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })
  await deleteDraft(id)
  return NextResponse.json({ ok: true })
})
