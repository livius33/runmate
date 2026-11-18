// The rebuild route against a small settings store (v1.1 10-02): state, preview (writes nothing), apply (block, edits,
// Saison goal, history) and undo. DB = the pg-proxy fake. Billing gate: tests/billing/gating.test.ts.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activities } from '@/lib/db/schema'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { TrainingBlock } from '@/lib/plan/types'
import { useFakeDb, rowOf, type Query } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user_r' }) }))
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-12-30T10:00:00Z'))            // Wednesday; the cut is Monday 4.1.2027

const PROFILE: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const template = listMethodologies().valid.find((m) => m.id === 'pfitzinger-half')!.params
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const block = freezeDraft(generateDraft({ goal: hm, template, start: '2026-11-30', profile: PROFILE,
  measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft,
hm, 'Pfitzinger – Halbmarathon', template)
const runs = block.sessions.filter((s) => s.date < '2026-12-30' && s.type !== 'rest' && (s.km ?? 0) > 0)
  .map((s, i) => rowOf(activities, { id: `a${i}`, userId: 'user_r', date: s.date, type: 'Run', name: s.title, distanceM: s.km! * 1000, durationS: s.km! * 330 }))

const store = new Map<string, string>()
const read = <T>(k: string) => JSON.parse(store.get(k) ?? 'null') as T
const settingsRows = (q: Query) => {
  const keys = q.params.slice(1).map(String)
  return [...store].filter(([k]) => keys.includes(k)).map(([k, v]) => (/select "value"/.test(q.sql) ? [v] : [k, v]))
}
const fake = useFakeDb((q) => {
  if (/^insert into "settings"/.test(q.sql)) { store.set(String(q.params[1]), String(q.params[2])); return [] }
  if (/^select .* from "settings"/.test(q.sql)) return settingsRows(q)
  if (/^select .* from "activities"/.test(q.sql)) return runs
  return []
})
afterAll(() => { fake.restore(); vi.useRealTimers() })
const edit = (date: string) => ({ date, type: 'easy', km: 5, title: 'Eigener Lauf' })
beforeEach(() => {
  store.clear(); fake.log.length = 0; delete process.env.BILLING_ENABLED
  store.set('season_goals', JSON.stringify({ v: 2, goals: [hm] }))
  store.set('athlete_profile', JSON.stringify(PROFILE))
  store.set('plan_blocks', JSON.stringify({ v: 1, blocks: [{ block, draftId: 'd1', liveAt: '2026-11-20T08:00:00Z', choice: { templateId: 'pfitzinger-half', overrides: {} } }] }))
  store.set('plan_overrides', JSON.stringify({ '2026-12-31': edit('2026-12-31'), '2027-01-12': edit('2027-01-12') }))
})

const { GET, POST } = await import('@/app/api/running/plan-rebuild/route')
const post = (body: unknown) => POST(new Request('http://localhost/api/running/plan-rebuild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const state = async () => (await GET(new Request('http://localhost/api/running/plan-rebuild'))).json()
const writes = () => fake.log.filter((q) => /^(insert|update|delete)/i.test(q.sql.trim()))
const liveBlock = () => read<{ blocks: { block: TrainingBlock; choice?: { templateId: string; overrides: Record<string, unknown> } }[] }>('plan_blocks').blocks[0]

describe('Neuaufbau: Stand und Vorschau', () => {
  it('GET: Block, Hebel, Datenprüfung, Methoden der Strecke, leerer Verlauf', async () => {
    const s = await state()
    expect(s.block).toMatchObject({ id: block.id, raceDate: '2027-02-28', goalS: 5100, templateId: 'pfitzinger-half', cut: '2027-01-04' })
    expect(s.tooLate).toBeNull()
    expect(s.base).toMatchObject({ source: 'runs2' })
    expect(s.data.base.state).toBe('good')
    expect(s.templates.length).toBeGreaterThan(1)
    expect(s.templates.every((t: { id: string }) => t.id.includes('half') || t.id.startsWith('own'))).toBe(true)
    expect([s.history, s.canApply, s.upsell]).toEqual([[], true, null])
  })
  it('GET ohne laufenden Generator-Plan: block null', async () => {
    store.delete('plan_blocks')
    expect((await state()).block).toBeNull()
  })
  it('Vorschau: Wochen, Summen, Begründungen, betroffene eigene Änderungen; nichts geschrieben', async () => {
    fake.log.length = 0
    const res = await post({ action: 'preview', change: { goalS: 5220 } })
    expect(res.status).toBe(200)
    const p = await res.json()
    expect(p).toMatchObject({ ok: true, cut: '2027-01-04', changed: true, removed: { manual: 1, engine: 0 } })
    expect(p.title).toBe('Zielzeit 1:25:00 → 1:27:00')
    expect(p.weeks[0]).toMatchObject({ start: '2027-01-04' })
    expect(p.reasons.join(' ')).toContain('Renntempo')
    expect(p.block).toBeUndefined()
    expect(writes()).toEqual([])
  })
  it('ungültige Eingaben: 400', async () => {
    for (const body of [{ action: 'preview', change: { goalS: 60 } }, { action: 'apply', change: { raceDate: 'morgen' } }, { action: 'x' },
      { action: 'preview', change: { profile: { v: 1, availableDays: [] } } }, { action: 'preview', change: { templateId: 'pfitzinger-marathon' } }]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(writes()).toEqual([])
  })
})

describe('Neuaufbau: Übernehmen und Rückgängig (AC-6)', () => {
  it('Übernehmen: Rest neu, Vergangenheit gleich, Änderungen ab dem Schnitt weg, Saison-Ziel und Verlauf geschrieben', async () => {
    const res = await post({ action: 'apply', change: { goalS: 5220, raceDate: '2027-03-14' } })
    expect(res.status).toBe(200)
    const now = liveBlock()
    expect(now.block.race).toMatchObject({ date: '2027-03-14', goalS: 5220 })
    expect(now.block.sessions.filter((s) => s.date < '2027-01-04')).toEqual(block.sessions.filter((s) => s.date < '2027-01-04'))
    expect(now.choice).toMatchObject({ templateId: 'pfitzinger-half' })
    expect(Object.keys(read<object>('plan_overrides'))).toEqual(['2026-12-31'])
    expect(read<{ goals: { date: string; goalS: number }[] }>('season_goals').goals[0]).toMatchObject({ date: '2027-03-14', goalS: 5220 })
    const s = await state()
    expect(s.history).toHaveLength(1)
    expect(s.history[0]).toMatchObject({ status: 'active', canUndo: true, removed: { manual: 1, engine: 0 }, title: 'Zielzeit 1:25:00 → 1:27:00 · Rennen 28.2.2027 → 14.3.2027' })
    expect(s.history[0].undo).toBeUndefined()
    expect(s.block).toMatchObject({ raceDate: '2027-03-14', goalS: 5220 })
  })
  it('Rückgängig: Block, eigene Änderung und Saison-Ziel wie vorher', async () => {
    const { entryId } = await (await post({ action: 'apply', change: { goalS: 5220, raceDate: '2027-03-14' } })).json()
    const res = await post({ action: 'undo', id: entryId })
    expect(res.status).toBe(200)
    expect(liveBlock().block).toEqual(block)
    expect(Object.keys(read<object>('plan_overrides')).sort()).toEqual(['2026-12-31', '2027-01-12'])
    expect(read<{ goals: unknown[] }>('season_goals').goals[0]).toEqual(hm)
    const s = await state()
    expect(s.history[0]).toMatchObject({ status: 'undone', canUndo: false })
    expect((await post({ action: 'undo', id: entryId })).status).toBe(400)
  })
  it('Alltag: das Profil wird mit dem Neuaufbau gespeichert und beim Rückgängig zurückgesetzt', async () => {
    const profile = { ...PROFILE, availableDays: [2, 4, 6, 7], restDay: null }
    const { entryId, reasons } = await (await post({ action: 'apply', change: { profile } })).json()
    expect(reasons.join(' ')).toContain('Lauftage')
    expect(read<AthleteProfile>('athlete_profile').availableDays).toEqual([2, 4, 6, 7])
    await post({ action: 'undo', id: entryId })
    expect(read<AthleteProfile>('athlete_profile').availableDays).toEqual(PROFILE.availableDays)
  })
  it('ohne Änderung am Rest: nichts zu übernehmen', async () => {
    await post({ action: 'apply', change: { goalS: 5220 } })
    fake.log.length = 0
    const res = await post({ action: 'apply', change: {} })
    expect([res.status, (await res.json()).error]).toEqual([400, expect.stringContaining('nichts zu ändern')])
    expect(writes()).toEqual([])
  })
})
