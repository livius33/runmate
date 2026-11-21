// DB side of plan drafts (07-06): settings 'plan_drafts' keeps the runner's choices (goal, template, start, input overrides),
// never a generated plan — every read regenerates the draft from the current runs, plan, profile and template, so a draft
// follows them until it goes live. Going live (07-14) freezes it into a training block in settings 'plan_blocks'; only
// goLive / takeOffline write to the live plan.
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { compareAndSetSetting, getSetting as getRawSetting, getSettingJson, setSettingJson } from '@/lib/db/settings'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import { allGoals, storedGoals, type SeasonGoal } from '@/lib/season/goals'
import { listMethodologies, listOwnBases } from './methodology/load'
import { NO_BLOCK, activeBlock, allWeeks, blocks, builtInBlocks } from './blocks'
import { loadPlan } from './load'
import { loadProfile } from './workshop-store'
import { measureInputs, type RunRow } from './generator/inputs'
import { GOAL_DISTANCE, generateDraft, type DraftOverrides, type DraftResult } from './generator/draft'
import { freezeDraft, goLiveError } from './generator/freeze'
import { LIVE_BLOCKS_KEY, ensureLiveBlocks, parseLive, readLiveEntries, type LiveEntry, type StoredLive } from './live-blocks'
import { fieldValue, templateKeys, tuneFields, tuneTemplate, type Tuning } from './methodology/tune'
import { OWN_KEY, OWN_NAME, buildOwn, isOwn, ownFields, ownValue, type StoredOwn } from './methodology/own'
import type { Methodology } from './methodology/schema'
import { currentEntitlements } from '@/lib/billing/access'
import { upsellText } from '@/lib/billing/entitlements'

const KEY = 'plan_drafts'
const TUNE_KEY = 'methodology_tuning'      // "Mein Ansatz" per template (07-05): { v: 1, byTemplate: { id: Tuning } }

export interface StoredDraft { id: string; goalId: string; templateId: string; start: string; overrides: DraftOverrides; createdAt: string; updatedAt: string }
interface Stored { v: 1; drafts: StoredDraft[] }
export interface DraftChoiceIn { goalId: string; templateId: string; start: string; overrides?: DraftOverrides; tuning?: Tuning }

// Allowed range per override; empty = measured.
const RANGES: Record<keyof DraftOverrides, [number, number]> = {
  currentKm: [5, 300], provenKm: [5, 300], peakKm: [10, 300], longest30Km: [0, 60], goalS: [600, 6 * 3600],
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const monday = (d: string) => ymd(startOfWeek(parseISO(d), { weekStartsOn: 1 }))

const getSetting = getSettingJson
const setSetting = setSettingJson
const allActivities = () => db.select().from(activities).where(own(activities))
export const loadDrafts = async () => (await getSetting<Stored>(KEY))?.drafts ?? []

// Base blocks (07-17) fill gaps and give way to a new goal block: the next plan can start after the current goal block,
// or next Monday when today is in a base block.
function activeGoalBlock(today: string) {
  const goal = blocks().filter((b) => !b.base)
  return goal.find((b) => b.planStart <= today && today <= b.end) ?? goal.find((b) => b.planStart > today) ?? goal[goal.length - 1] ?? activeBlock(today)
}
const goalBlockEnd = (today: string) => {
  const b = activeGoalBlock(today)
  return b === NO_BLOCK || b.end < today ? today : b.end
}

// Everything a draft is generated from, read once per request.
export async function context(today: string) {
  const [rows, plan, profile, season, tuneRow, ownRow] = await Promise.all([allActivities(), loadPlan(), loadProfile(), getSetting<unknown>('season_goals'),
    getSetting<{ v: 1; byTemplate: Record<string, Tuning> }>(TUNE_KEY), getSetting<StoredOwn>(OWN_KEY)])
  const tuning = tuneRow?.byTemplate ?? {}
  const own: StoredOwn = ownRow ?? { v: 1, name: '', byDistance: {}, savedAt: null }
  const runs: RunRow[] = rows.filter((r) => RUN_ACTIVITY_TYPES.includes(r.type))
    .map((r) => ({ date: r.date, distanceM: r.distanceM, durationS: r.durationS, workoutType: r.workoutType, sportType: r.sportType }))
  const goals = allGoals(storedGoals(season)).filter((g) => g.priority === 'A' && !g.fromPlan && g.date > today)
  const templates: TemplateEntry[] = listMethodologies().valid.map((m) => {
    const tuned = tuneTemplate(m.params, tuning[m.id] ?? {})
    const params = tuned.ok ? tuned.template : m.params
    return {
      id: m.id, name: m.meta.name, summary: m.meta.summary, distances: m.meta.distances, tuning: tuning[m.id] ?? {},
      keys: templateKeys(params, m.meta.distances[0]),
      fields: tuneFields(m.params).map((f) => ({ ...f, template: fieldValue(m.params, f.path) as number | boolean })),
    }
  })
  // The own method (07-19): one entry per distance, after the book methods; "Vergleich mit …" lists the book methods
  // of that distance (with their "Mein Ansatz") as values of the same fields.
  for (const b of listOwnBases().valid) {
    const d = b.params.distances[0]
    const values = own.byDistance[d] ?? {}
    const built = buildOwn(b.params, values, own.name)
    const fields = ownFields(b.params)
    templates.push({
      id: b.id, name: OWN_NAME, summary: b.meta.summary, distances: b.meta.distances, tuning: values,
      keys: templateKeys(built.ok ? built.template : b.params, d),
      fields: fields.map((f) => ({ ...f, template: ownValue(b.params, f.path) as number | boolean })),
      own: { name: own.name, compare: templates.filter((t) => !isOwn(t.id) && t.distances.includes(d)).map((t) => {
        const m = listMethodologies().valid.find((x) => x.id === t.id)!.params
        const tuned = tuneTemplate(m, t.tuning)
        const p = tuned.ok ? tuned.template : m
        return { id: t.id, name: t.name, values: Object.fromEntries(fields.map((f) => [f.path, ownValue(p, f.path) ?? null])) }
      }) },
    })
  }
  const defaultStart = ymd(addDays(parseISO(monday(goalBlockEnd(today))), 7))
  return { runs, plan, profile, goals, templates, defaultStart, tuning, own }
}
export type Ctx = Awaited<ReturnType<typeof context>>
type FieldOut = ReturnType<typeof tuneFields>[number] & { template: number | boolean }
interface TemplateEntry {
  id: string; name: string; summary: string; distances: string[]; tuning: Tuning; keys: ReturnType<typeof templateKeys>; fields: FieldOut[]
  own?: { name: string; compare: { id: string; name: string; values: Record<string, number | boolean | string | null> }[] }
}

// The template a choice is generated from: a book method with "Mein Ansatz", or the own method (07-19).
export function resolveTemplate(ctx: Ctx, templateId: string, tuning?: Tuning): { ok: true; template: Methodology; label: string } | { ok: false; error: string } {
  if (isOwn(templateId)) {
    const b = listOwnBases().valid.find((m) => m.id === templateId)
    if (!b) return { ok: false, error: `Grundlage „${templateId}“ fehlt oder ist ungültig.` }
    const r = buildOwn(b.params, tuning ?? ctx.own.byDistance[b.params.distances[0]] ?? {}, ctx.own.name)
    return r.ok ? { ok: true, template: r.template, label: ctx.own.name.trim() || 'Eigene Methode' } : { ok: false, error: `Eigene Methode: ${r.errors.join('; ')}` }
  }
  const m = listMethodologies().valid.find((x) => x.id === templateId)
  if (!m) return { ok: false, error: `Vorlage „${templateId}“ fehlt oder ist ungültig.` }
  const own = tuning ?? ctx.tuning[templateId] ?? {}
  const r = tuneTemplate(m.params, own)
  return r.ok ? { ok: true, template: r.template, label: `${m.meta.name}${Object.keys(own).length ? ' (Mein Ansatz)' : ''}` } : { ok: false, error: `Mein Ansatz: ${r.errors.join('; ')}` }
}

function generate(ctx: Ctx, c: DraftChoiceIn, today: string): DraftResult {
  const goal = ctx.goals.find((g) => g.id === c.goalId)
  if (!goal) return { ok: false, error: 'Das Ziel gibt es nicht mehr (oder es ist kein kommendes Hauptrennen).' }
  const tuned = resolveTemplate(ctx, c.templateId, c.tuning)
  if (!tuned.ok) return tuned
  const template = tuned.template
  const distance = GOAL_DISTANCE[goal.kind]
  const measured = measureInputs({ runs: ctx.runs, plan: ctx.plan, weeks: allWeeks(), today, start: c.start, distance: distance ?? 'half', profile: ctx.profile })
  return generateDraft({ goal, template, start: monday(c.start), profile: ctx.profile, measured, overrides: c.overrides })
}

// German error, or null when the choice can be generated/saved.
function validate(ctx: Ctx, c: DraftChoiceIn): string | null {
  const goal = ctx.goals.find((g) => g.id === c.goalId)
  if (!goal) return 'Bitte ein kommendes Hauptrennen wählen.'
  const t = ctx.templates.find((x) => x.id === c.templateId)
  const distance = GOAL_DISTANCE[goal.kind]
  if (!t) return 'Bitte eine Vorlage wählen.'
  if (!distance || !t.distances.includes(distance)) return `Die Vorlage „${t.name}“ passt nicht zu ${goal.name}.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.start) || c.start >= goal.date) return 'Der Start muss vor dem Rennen liegen.'
  for (const [k, v] of Object.entries(c.overrides ?? {}) as [keyof DraftOverrides, number | null][]) {
    if (v == null) continue
    const [lo, hi] = RANGES[k] ?? [0, 0]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) return `${k}: bitte ${lo}–${hi} oder leer lassen.`
  }
  return null
}

export async function listDrafts(today: string) {
  const ctx = await context(today)
  const drafts = (await loadDrafts()).map((d) => ({ draft: d, result: generate(ctx, d, today) }))
  const live = (await readLiveEntries()).map((e) => ({ id: e.block.id, draftId: e.draftId, goalId: e.block.goalId, liveAt: e.liveAt,
    planStart: e.block.planStart, end: e.block.end, name: e.block.race.name }))
  return { goals: ctx.goals as SeasonGoal[], templates: ctx.templates, defaultStart: ctx.defaultStart, profile: !!ctx.profile, drafts, live }
}

export type PlanState = 'none' | 'draft' | 'live'
export interface GoalPlanStatus { goalId: string; name: string; date: string; state: PlanState; draftId: string | null; planStart: string | null }

// Plan status per upcoming main race, without generating anything (Plan page and Saison cards).
export async function planStatus(today: string) {
  const [season, drafts, live] = await Promise.all([getSetting<unknown>('season_goals'), loadDrafts(), readLiveEntries()])
  const goals = allGoals(storedGoals(season)).filter((g) => g.priority === 'A' && !g.fromPlan && g.date > today)
  const status: GoalPlanStatus[] = goals.map((g) => {
    const l = live.find((e) => e.block.goalId === g.id)
    const d = drafts.find((x) => x.goalId === g.id)
    return { goalId: g.id, name: g.name, date: g.date, state: l ? 'live' : d ? 'draft' : 'none', draftId: l?.draftId ?? d?.id ?? null, planStart: l?.block.planStart ?? d?.start ?? null }
  })
  const block = activeGoalBlock(today)
  const next = blocks().find((b) => !b.base && b.planStart > block.end)
  return { status, activeEnd: goalBlockEnd(today), activeName: block.race.shortName, nextBlockStart: next?.planStart ?? null }
}

// Freeze a saved draft into a training block and make it part of the live plan.
// Entitlements (Phase 4): Free keeps one live plan (finished blocks do not count) and no own method; `code` lets the
// route answer 402 with the upsell.
export async function goLive(draftId: string, today: string): Promise<{ error: string; code?: string } | { block: { id: string; planStart: string; end: string } }> {
  const ctx = await context(today)
  const stored = (await loadDrafts()).find((d) => d.id === draftId)
  if (!stored) return { error: 'Entwurf nicht gefunden: erst speichern.' }
  const e = await currentEntitlements()
  const running = (await readLiveEntries()).filter((x) => x.block.end >= today).length
  const gate = !e.features.plan ? 'plan' as const
    : running >= e.maxLivePlans ? 'multiPlan' as const
      : isOwn(stored.templateId) && !e.features.ownMethod ? 'ownMethod' as const : null
  if (gate) return { error: upsellText(gate), code: 'plus-required' }
  const result = generate(ctx, stored, today)
  if (!result.ok) return { error: result.error }
  const goal = ctx.goals.find((g) => g.id === stored.goalId)!
  const tuned = resolveTemplate(ctx, stored.templateId)
  if (!tuned.ok) return { error: tuned.error }
  const block = freezeDraft(result, goal, tuned.label, tuned.template)
  const err = await commitLiveEntry({ block, draftId, liveAt: new Date().toISOString(), choice: { templateId: stored.templateId, overrides: stored.overrides } }, e.maxLivePlans, today)
  if (err) return err
  await ensureLiveBlocks(true)
  return { block: { id: block.id, planStart: block.planStart, end: block.end } }
}

// The write of a go-live (12-05, finding 11): the live-plan limit and the overlap check run against the value that is
// replaced, and the write lands only if nobody changed it in between (compare-and-set). Two requests at once cannot both
// take a plan live on a Free account; the loser checks again and gets the upsell. null = written.
export async function commitLiveEntry(entry: LiveEntry, maxLivePlans: number, today: string): Promise<{ error: string; code?: string } | null> {
  for (let i = 0; i < 3; i++) {
    const raw = await getRawSetting(LIVE_BLOCKS_KEY)
    const entries = parseLive(raw ?? undefined)
    if (entries.filter((x) => x.block.end >= today).length >= maxLivePlans) return { error: upsellText('multiPlan'), code: 'plus-required' }
    const err = goLiveError(entry.block, [...builtInBlocks(), ...entries.map((x) => x.block)], today)
    if (err) return { error: err }
    if (await compareAndSetSetting(LIVE_BLOCKS_KEY, raw, JSON.stringify({ v: 1, blocks: [...entries, entry] } satisfies StoredLive))) return null
  }
  return { error: 'Der Plan wurde gerade an anderer Stelle geändert. Bitte noch einmal versuchen.' }
}

// Save the own method for one distance (empty = the neutral base) and its name; checked like a template file (07-19).
export async function saveOwn(templateId: string, values: Tuning, name: string): Promise<{ error: string; code?: string } | { ok: true }> {
  const e = await currentEntitlements()
  if (!e.features.ownMethod) return { error: upsellText('ownMethod'), code: 'plus-required' }
  const b = listOwnBases().valid.find((m) => m.id === templateId)
  if (!b) return { error: 'Grundlage nicht gefunden.' }
  const r = buildOwn(b.params, values, name)
  if (!r.ok) return { error: r.errors.join('; ') }
  const old = (await getSetting<StoredOwn>(OWN_KEY)) ?? { v: 1, name: '', byDistance: {}, savedAt: null }
  const byDistance = { ...old.byDistance, [b.params.distances[0]]: values }
  if (!Object.keys(values).length) delete byDistance[b.params.distances[0]]
  await setSetting(OWN_KEY, { v: 1, name: name.trim().slice(0, 60), byDistance, savedAt: new Date().toISOString() } satisfies StoredOwn)
  return { ok: true }
}

// Save "Mein Ansatz" for a template (empty = back to the template); checked like a template file.
export async function saveTuning(templateId: string, tuning: Tuning) {
  const m = listMethodologies().valid.find((x) => x.id === templateId)
  if (!m) return { error: 'Vorlage nicht gefunden.' }
  const r = tuneTemplate(m.params, tuning)
  if (!r.ok) return { error: r.errors.join('; ') }
  const row = (await getSetting<{ v: 1; byTemplate: Record<string, Tuning> }>(TUNE_KEY))?.byTemplate ?? {}
  const byTemplate = { ...row, [templateId]: tuning }
  if (!Object.keys(tuning).length) delete byTemplate[templateId]
  await setSetting(TUNE_KEY, { v: 1, byTemplate })
  return { ok: true }
}

// Remove a live block again; manual edits on its dates stay stored but no longer apply.
export async function takeOffline(blockId: string) {
  const entries = await readLiveEntries()
  if (!entries.some((e) => e.block.id === blockId)) return { error: 'Dieser Plan ist nicht live.' }
  await setSetting(LIVE_BLOCKS_KEY, { v: 1, blocks: entries.filter((e) => e.block.id !== blockId) } satisfies StoredLive)
  await ensureLiveBlocks(true)
  return { ok: true }
}

export async function previewDraft(c: DraftChoiceIn, today: string): Promise<DraftResult> {
  const ctx = await context(today)
  const err = validate(ctx, c)
  return err ? { ok: false, error: err } : generate(ctx, c, today)
}

export async function saveDraft(c: DraftChoiceIn & { id?: string }, today: string) {
  const ctx = await context(today)
  const err = validate(ctx, c)
  if (err) return { error: err }
  const drafts = await loadDrafts()
  const now = new Date().toISOString()
  const old = c.id ? drafts.find((d) => d.id === c.id) : undefined
  const draft: StoredDraft = {
    id: old?.id ?? `draft-${Date.now().toString(36)}`, goalId: c.goalId, templateId: c.templateId, start: monday(c.start),
    overrides: Object.fromEntries(Object.entries(c.overrides ?? {}).filter(([, v]) => v != null)), createdAt: old?.createdAt ?? now, updatedAt: now,
  }
  await setSetting(KEY, { v: 1, drafts: [draft, ...drafts.filter((d) => d.id !== draft.id)] } satisfies Stored)
  return { draft }
}

export async function deleteDraft(id: string) {
  const drafts = await loadDrafts()
  await setSetting(KEY, { v: 1, drafts: drafts.filter((d) => d.id !== id) } satisfies Stored)
}
