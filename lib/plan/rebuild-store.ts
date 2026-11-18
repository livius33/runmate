// DB side of a rebuild (v1.1 10-02): reads what lib/plan/rebuild.ts needs, shows the result (preview writes nothing),
// applies it (live block, edits from the cut, Saison goal, profile) and keeps a history in settings 'plan_rebuilds'
// whose newest entry per block can be undone. Rules: methodologies/research/plan-changes.md §2.
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { SEASON_KEY, isShort, storedGoals, validateGoal, type SeasonGoal, type StoredSeason } from '@/lib/season/goals'
import { currentEntitlements } from '@/lib/billing/access'
import { upsellText } from '@/lib/billing/entitlements'
import { allWeeks, builtInBlocks } from './blocks'
import { context, loadDrafts, resolveTemplate, type Ctx, type StoredDraft } from './draft-store'
import { loadEngineState, runAndSaveEngine, saveEngineState } from './engine-store'
import type { EngineState } from './engine'
import type { Overrides } from './effective'
import { GOAL_DISTANCE, type DraftOverrides } from './generator/draft'
import { LIVE_BLOCKS_KEY, ensureLiveBlocks, readLiveEntries, type LiveEntry, type StoredLive } from './live-blocks'
import { loadOverrides, saveOverrides } from './load'
import { isOwn } from './methodology/own'
import { loadPauses } from './pause-store'
import { saveProfile } from './workshop-store'
import type { AthleteProfile } from './athlete-profile'
import {
  cutOf, dataCheck, entryTitle, rebuild, rebuildBase, splitEdits, tooLate, undoBlock, undoable,
  type RebuildChange, type RebuildEntry, type RebuildInput, type Rebuilt,
} from './rebuild'

const KEY = 'plan_rebuilds'
const KEEP = 12          // history entries
const UNDO_KEEP = 3      // entries that keep what an undo needs (a whole block each)
interface Stored { v: 1; entries: RebuildEntry[] }

export interface RebuildRequest {
  blockId?: string
  goalS?: number
  raceDate?: string
  templateId?: string
  currentKm?: number
  peakKm?: number | null       // null = back to the recommended peak
  profile?: AthleteProfile     // unsaved "Alltag" values; saved with the rebuild
}
type Fail = { error: string; code?: string; needs?: 'currentKm' }

const loadHistory = async () => (await getSettingJson<Stored>(KEY))?.entries ?? []
const sameProfile = (a: AthleteProfile | null, b: AthleteProfile | null) => JSON.stringify({ ...a, savedAt: null }) === JSON.stringify({ ...b, savedAt: null })
const later = (a: string, b: string) => (a > b ? a : b)

// Generated blocks whose race is still ahead, the running one first.
const rebuildable = (entries: LiveEntry[], today: string) => entries
  .filter((e) => !e.block.base && !e.block.handWritten && e.block.race.date > today)
  .sort((a, b) => a.block.planStart.localeCompare(b.block.planStart))

// The method and inputs a block was built from: kept on the entry since v1.1, else read from its draft.
function choiceOf(entry: LiveEntry, drafts: StoredDraft[]): { templateId: string | null; overrides: DraftOverrides } {
  const d = drafts.find((x) => x.id === entry.draftId)
  const c = entry.choice ?? (d ? { templateId: d.templateId, overrides: d.overrides } : null)
  return { templateId: c?.templateId ?? null, overrides: { provenKm: c?.overrides.provenKm ?? null, peakKm: c?.overrides.peakKm ?? null, goalS: c?.overrides.goalS ?? null } }
}

async function load(today: string) {
  await ensureLiveBlocks()
  const [ctx, entries, drafts, pauses, manual, engine, history, e, season] = await Promise.all([
    context(today), readLiveEntries(), loadDrafts(), loadPauses(), loadOverrides(), loadEngineState(), loadHistory(), currentEntitlements(),
    getSettingJson<unknown>(SEASON_KEY)])
  return { ctx, entries, drafts, pauses, manual, engine, history, e, season: storedGoals(season) }
}
type Loaded = Awaited<ReturnType<typeof load>>

// Everything one rebuild is computed from; `req` holds only what the runner changed.
function prepare(l: Loaded, req: RebuildRequest, today: string): Fail | { entry: LiveEntry; input: RebuildInput; goal: SeasonGoal; templateId: string; oldTemplateId: string | null; ownGate: boolean } {
  const live = rebuildable(l.entries, today)
  const entry = req.blockId ? live.find((x) => x.block.id === req.blockId) : live[0]
  if (!entry) return { error: 'Es gibt keinen laufenden Plan aus dem Generator: ein neuer Plan beginnt unter „Neuer Plan“.' }
  const goal = l.ctx.goals.find((g) => g.id === entry.block.goalId)
  if (!goal) return { error: 'Das Ziel dieses Plans gibt es in der Saison nicht mehr.' }
  const choice = choiceOf(entry, l.drafts)
  const templateId = req.templateId ?? choice.templateId
  if (!templateId) return { error: 'Die Methode dieses Plans ist nicht mehr bekannt: bitte eine Methode wählen.' }
  const tuned = resolveTemplate(l.ctx, templateId)
  if (!tuned.ok) return { error: tuned.error }
  const distance = GOAL_DISTANCE[goal.kind]
  if (!distance || !tuned.template.distances.includes(distance)) return { error: 'Diese Methode gibt es für die Strecke deines Rennens nicht.' }
  const old = choice.templateId ? resolveTemplate(l.ctx, choice.templateId) : null
  if (req.raceDate && req.raceDate !== goal.date) {
    const err = validateGoal({ ...goal, date: req.raceDate }, l.season, today)
    if (err) return { error: err }
  }
  const change: RebuildChange = {
    goalS: req.goalS ?? null, raceDate: req.raceDate ?? null, templateId: templateId !== choice.templateId ? templateId : null,
    currentKm: req.currentKm ?? null, ...(req.peakKm !== undefined ? { peakKm: req.peakKm } : {}),
  }
  const input: RebuildInput = {
    block: entry.block, goal, change, template: tuned.template, templateLabel: tuned.label, oldTemplateLabel: old?.ok ? old.label : null,
    profile: req.profile ?? l.ctx.profile, oldProfile: l.ctx.profile, carried: choice.overrides,
    runs: l.ctx.runs, plan: l.ctx.plan, weeks: allWeeks(), pauses: l.pauses,
    others: [...builtInBlocks(), ...l.entries.map((x) => x.block)].filter((b) => b.id !== entry.block.id), today,
  }
  return { entry, input, goal, templateId, oldTemplateId: choice.templateId, ownGate: isOwn(templateId) && templateId !== choice.templateId && !l.e.features.ownMethod }
}

// Engine overrides and manual edits in [from, to] leave with the plan they were made for. Engine changes that touch
// those days are marked as taken back; nothing is vetoed, so the engine looks at the new plan afresh.
function stripEdits(manual: Overrides, engine: EngineState, from: string, to: string) {
  const m = splitEdits(manual, from, to)
  const g = splitEdits(engine.overrides, from, to)
  const ids = engine.log.filter((c) => c.status === 'active' && Object.keys(c.after).some((d) => d >= from && d <= to)).map((c) => c.id)
  const state: EngineState = { ...engine, overrides: g.kept, log: engine.log.map((c) => (ids.includes(c.id) ? { ...c, status: 'undone' as const } : c)) }
  return { manual: m, engine: g, ids, state }
}

const publicEntry = (list: RebuildEntry[], e: RebuildEntry) => ({ ...e, undo: undefined, canUndo: undoable(list, e) })

function view(r: Rebuilt, l: Loaded, input: RebuildInput) {
  const to = later(input.block.end, r.block.end)
  const edits = stripEdits(l.manual, l.engine, r.cut, to)
  const rest = (b: typeof r.block) => JSON.stringify([b.race, b.sessions.filter((s) => s.date >= r.cut)])
  return {
    ok: true as const, blockId: r.block.id, cut: r.cut, title: entryTitle(r, input), changed: rest(input.block) !== rest(r.block),
    before: r.before, after: r.after, weeks: r.weeks, reasons: r.reasons, warnings: r.warnings, base: r.base, data: r.data,
    recommendedPeakKm: r.draft.skeleton.peak.recommendedKm,
    removed: { manual: Object.keys(edits.manual.removed).length, engine: Object.keys(edits.engine.removed).length },
  }
}

// What the page shows before any change: the block, its current levers, the data check, and the history.
export async function rebuildState(today: string, blockId?: string) {
  const l = await load(today)
  const history = [...l.history].reverse().map((e) => publicEntry(l.history, e))
  const canApply = l.e.features.rebuild
  const common = { history, canApply, upsell: canApply ? null : upsellText('rebuild', l.e), profile: l.ctx.profile }
  const live = rebuildable(l.entries, today)
  const entry = blockId ? live.find((x) => x.block.id === blockId) : live[0]
  const goal = entry && l.ctx.goals.find((g) => g.id === entry.block.goalId)
  if (!entry || !goal) return { block: null, blocks: [], ...common }
  const choice = choiceOf(entry, l.drafts)
  const distance = GOAL_DISTANCE[goal.kind]
  const tuned = choice.templateId ? resolveTemplate(l.ctx, choice.templateId) : null
  const cut = cutOf(today, entry.block)
  const base = rebuildBase({ runs: l.ctx.runs, pauses: l.pauses, today })
  const p = prepare(l, { blockId: entry.block.id }, today)
  const r = 'error' in p ? null : rebuild(p.input)
  return {
    block: {
      id: entry.block.id, name: entry.block.race.name, raceDate: goal.date, planStart: entry.block.planStart, cut,
      goalS: choice.overrides.goalS ?? goal.goalS, templateId: choice.templateId, templateLabel: tuned?.ok ? tuned.label : null,
      peakKm: choice.overrides.peakKm ?? null, short: isShort(goal.kind),
    },
    blocks: live.map((x) => ({ id: x.block.id, name: x.block.race.name, raceDate: x.block.race.date })),
    tooLate: tuned?.ok ? tooLate(tuned.template, goal, cut) : null,
    base: r && 'base' in r && r.base ? r.base : base,
    data: r && 'data' in r && r.data ? r.data : dataCheck({ runs: l.ctx.runs, today, base, measured: { recentRace: null, longest30Km: 0 }, profile: l.ctx.profile }),
    templates: l.ctx.templates.filter((t) => distance && t.distances.includes(distance))
      .map((t) => ({ id: t.id, name: t.name, summary: t.summary, locked: isOwn(t.id) && !l.e.features.ownMethod && t.id !== choice.templateId })),
    pause: base.pauseDays ? { days: base.pauseDays, replan: base.pauseDays >= 14 } : null,
    ...common,
  }
}

export async function previewRebuild(req: RebuildRequest, today: string): Promise<Fail | ReturnType<typeof view>> {
  const l = await load(today)
  const p = prepare(l, req, today)
  if ('error' in p) return p
  const r = rebuild(p.input)
  if (!r.ok) return { error: r.error, needs: r.needs }
  return view(r, l, p.input)
}

const cap = (entries: RebuildEntry[]) => entries.slice(-KEEP).map((e, i, a) => (i < a.length - UNDO_KEEP ? { ...e, undo: null } : e))

export async function applyRebuild(req: RebuildRequest, today: string): Promise<Fail | (ReturnType<typeof view> & { entryId: string })> {
  const l = await load(today)
  if (!l.e.features.rebuild) return { error: upsellText('rebuild', l.e), code: 'plus-required' }
  const p = prepare(l, req, today)
  if ('error' in p) return p
  if (p.ownGate) return { error: upsellText('ownMethod', l.e), code: 'plus-required' }
  const r = rebuild(p.input)
  if (!r.ok) return { error: r.error, needs: r.needs }
  const out = view(r, l, p.input)
  if (!out.changed) return { error: 'Der Plan passt schon zu diesen Angaben: es gibt nichts zu ändern.' }

  const { entry, input, goal } = p
  const edits = stripEdits(l.manual, l.engine, r.cut, later(entry.block.end, r.block.end))
  const goalChanged = r.goal.date !== goal.date || r.goal.goalS !== goal.goalS
  const profileChanged = !!req.profile && !sameProfile(req.profile, l.ctx.profile)
  const item: RebuildEntry = {
    id: `rb-${Date.now().toString(36)}`, at: new Date().toISOString(), blockId: entry.block.id, cut: r.cut, title: out.title,
    reasons: r.reasons, before: r.before, after: r.after, removed: out.removed, status: 'active',
    undo: {
      block: entry.block, templateId: p.oldTemplateId, carried: input.carried, manual: edits.manual.removed, engine: edits.engine.removed,
      engineLog: edits.ids, goal: goalChanged ? { date: goal.date, goalS: goal.goalS } : null, profile: profileChanged ? l.ctx.profile : null,
    },
  }
  // The history first: should a later write fail, undoing it only restores what is still there.
  await setSettingJson(KEY, { v: 1, entries: cap([...l.history, item]) } satisfies Stored)
  // A typed goal time now lives in the Saison goal, so it is no longer carried as the block's own input.
  const carried: DraftOverrides = { ...input.carried, goalS: req.goalS != null ? null : input.carried.goalS, ...(req.peakKm !== undefined ? { peakKm: req.peakKm } : {}) }
  await setSettingJson(LIVE_BLOCKS_KEY, { v: 1, blocks: l.entries.map((x) => (x === entry ? { ...x, block: r.block, choice: { templateId: p.templateId, overrides: carried } } : x)) } satisfies StoredLive)
  if (out.removed.manual) await saveOverrides(edits.manual.kept)
  if (out.removed.engine || edits.ids.length) await saveEngineState(edits.state)
  if (goalChanged) await setSettingJson(SEASON_KEY, { v: 2, goals: l.season.map((g) => (g.id === goal.id ? { ...g, date: r.goal.date, goalS: r.goal.goalS } : g)) } satisfies StoredSeason)
  if (profileChanged) await saveProfile(req.profile!)
  await ensureLiveBlocks(true)
  await runAndSaveEngine(today)
  return { ...out, entryId: item.id }
}

// Takes back the newest rebuild of a block. Free for everyone: nobody is left with a plan they cannot leave.
export async function undoRebuild(id: string, today: string): Promise<Fail | { ok: true; from: string }> {
  await ensureLiveBlocks()
  const [history, entries, manual, engine, season] = await Promise.all([loadHistory(), readLiveEntries(), loadOverrides(), loadEngineState(), getSettingJson<unknown>(SEASON_KEY)])
  const item = history.find((e) => e.id === id)
  if (!item || !item.undo || !undoable(history, item)) return { error: 'Das lässt sich nicht mehr zurücknehmen.' }
  const entry = entries.find((x) => x.block.id === item.blockId)
  if (!entry) return { error: 'Dieser Plan ist nicht mehr live.' }
  const u = undoBlock(entry.block, item.undo.block, today)
  if ('error' in u) return u
  const clash = [...builtInBlocks(), ...entries.map((x) => x.block)].find((b) => b.id !== u.block.id && !b.base && u.block.planStart <= b.end && b.planStart <= u.block.end)
  if (clash) return { error: `Der alte Plan würde sich mit „${clash.race.name}“ überschneiden: das lässt sich nicht mehr zurücknehmen.` }

  // Edits made on the rebuilt rest leave with it; the ones the rebuild took away return from `u.from`.
  const to = later(entry.block.end, u.block.end)
  const edits = stripEdits(manual, engine, u.from, to)
  const back = (o: Overrides) => Object.fromEntries(Object.entries(o).filter(([d]) => d >= u.from))
  const engineBack = back(item.undo.engine)
  const ids = item.undo.engineLog.filter((x) => engine.log.some((c) => c.id === x && Object.keys(c.after).some((d) => d >= u.from)))
  await setSettingJson(LIVE_BLOCKS_KEY, { v: 1, blocks: entries.map((x) => (x === entry
    ? { ...x, block: u.block, choice: item.undo!.templateId ? { templateId: item.undo!.templateId, overrides: item.undo!.carried } : undefined } : x)) } satisfies StoredLive)
  await saveOverrides({ ...edits.manual.kept, ...back(item.undo.manual) })
  await saveEngineState({ ...edits.state, overrides: { ...edits.state.overrides, ...engineBack }, log: edits.state.log.map((c) => (ids.includes(c.id) ? { ...c, status: 'active' as const } : c)) })
  const g = item.undo.goal
  if (g) await setSettingJson(SEASON_KEY, { v: 2, goals: storedGoals(season).map((x) => (x.id === entry.block.goalId ? { ...x, date: g.date, goalS: g.goalS } : x)) } satisfies StoredSeason)
  if (item.undo.profile) await saveProfile(item.undo.profile)
  await setSettingJson(KEY, { v: 1, entries: history.map((e) => (e.id === id ? { ...e, status: 'undone' as const, undo: null } : e)) } satisfies Stored)
  await ensureLiveBlocks(true)
  await runAndSaveEngine(today)
  return { ok: true, from: u.from }
}

export type RebuildState = Awaited<ReturnType<typeof rebuildState>>
export type RebuildPreview = ReturnType<typeof view>
export type { Ctx }
