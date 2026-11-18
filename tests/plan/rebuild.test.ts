// Rebuild of a live block on the runner's request (v1.1 10-02): base, data check, splice, preview, undo.
// Rules: methodologies/research/plan-changes.md §2.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import type { RunRow } from '@/lib/plan/generator/inputs'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { cutOf, dataCheck, rebuild, rebuildBase, splitEdits, tooLate, undoBlock, undoable, type RebuildEntry, type RebuildInput, type Rebuilt } from '@/lib/plan/rebuild'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'
import { plus } from './arbitraries'

const PROFILE: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const method = (id: string) => listMethodologies().valid.find((m) => m.id === id)!
const template = method('pfitzinger-half').params
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!          // 28.2.2027, 1:25:00
const draft = generateDraft({ goal: hm, template, start: '2026-11-30', profile: PROFILE,
  measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
const block = freezeDraft(draft, hm, 'Pfitzinger – Halbmarathon', template)

// The runner ran the plan as written up to `until` (exclusive), except in [skipFrom, skipTo].
const ranPlan = (until: string, skip?: [string, string]): RunRow[] => block.sessions
  .filter((s) => s.date < until && s.type !== 'rest' && (s.km ?? 0) > 0 && !(skip && s.date >= skip[0] && s.date <= skip[1]))
  .map((s) => ({ date: s.date, distanceM: s.km! * 1000, durationS: s.km! * 330 }))
const before = (weeks: number, km: number): RunRow[] => Array.from({ length: weeks * 4 }, (_, i) =>
  ({ date: plus('2026-11-29', -Math.floor(i / 4) * 7 - (i % 4) * 2), distanceM: (km / 4) * 1000, durationS: (km / 4) * 330 }))

const TODAY = '2026-12-30'                                       // Wednesday of week 5; the cut is Monday 4.1.2027
const input = (over: Partial<RebuildInput> = {}): RebuildInput => ({
  block, goal: hm, change: {}, template, templateLabel: 'Pfitzinger – Halbmarathon', oldTemplateLabel: 'Pfitzinger – Halbmarathon',
  profile: PROFILE, oldProfile: PROFILE, carried: {}, runs: [...before(8, 50), ...ranPlan(TODAY)], plan: block.sessions, weeks: block.weeks,
  pauses: [], others: [], today: TODAY, ...over,
})
const ok = (r: ReturnType<typeof rebuild>) => { if (!r.ok) throw new Error(r.error); return r as Rebuilt }

describe('Schnitt und Vergangenheit (AC-1)', () => {
  it('der Schnitt ist der Montag nach heute, vor dem Start der Planstart', () => {
    expect(cutOf(TODAY, block)).toBe('2027-01-04')
    expect(cutOf('2027-01-03', block)).toBe('2027-01-04')       // Sunday
    expect(cutOf('2027-01-04', block)).toBe('2027-01-11')       // Monday: the running week stays
    expect(cutOf('2026-11-01', block)).toBe('2026-11-30')
  })
  it('ohne Änderung: alles vor dem Schnitt ist der gespeicherte Block, Tag für Tag', () => {
    const r = ok(rebuild(input()))
    expect(r.cut).toBe('2027-01-04')
    expect(r.block.sessions.filter((s) => s.date < r.cut)).toEqual(block.sessions.filter((s) => s.date < r.cut))
    expect(r.block.weeks.filter((w) => w.start < r.cut)).toEqual(block.weeks.filter((w) => w.start < r.cut))
    expect([r.block.id, r.block.planStart, r.block.race.date]).toEqual([block.id, block.planStart, hm.date])
    expect(r.block.sessions.map((s) => s.date)).toEqual([...new Set(r.block.sessions.map((s) => s.date))].sort())
    expect(r.block.weeks.map((w) => w.start)).toEqual(block.weeks.map((w) => w.start))
  })
  it('der neue Rest besteht dieselben Prüfungen wie ein neuer Entwurf', () => {
    const r = ok(rebuild(input()))
    const base = { template, distance: 'half' as const, raceDate: hm.date, raceName: hm.name, profile: PROFILE, goalS: hm.goalS!, recentRace: null }
    const rest = r.block.sessions.filter((s) => s.date >= r.cut && s.date <= r.draft.days.weeks[r.draft.days.weeks.length - 1].end)
    expect(checkDays({ ...r.draft.days, sessions: rest }, r.draft.skeleton, { ...base, racePaceS: r.draft.paces.racePaceS,
      longest30Km: r.draft.inputs.longest30Km.value ?? 0, longest12mKm: 42.2 })).toEqual([])
    expect(checkWorkouts({ ...r.draft.workouts, sessions: rest }, r.draft.days, r.draft.skeleton, base)).toEqual([])
  })
})

describe('Grundlage (AC-4)', () => {
  it('ohne Pause: Schnitt der letzten 2 abgeschlossenen Wochen, auf 0,5 km', () => {
    const runs = ranPlan(TODAY)
    const km = (from: string) => runs.filter((r) => r.date >= from && r.date < plus(from, 7)).reduce((t, r) => t + r.distanceM / 1000, 0)
    const b = rebuildBase({ runs, pauses: [], today: TODAY })
    expect(b.source).toBe('runs2')
    expect(b.km).toBe(Math.round(((km('2026-12-14') + km('2026-12-21')) / 2) * 2) / 2)
    expect(b.text).toContain('Schnitt deiner letzten 2 Wochen')
  })
  it('nach 14 Tagen Pause: 70 % des Umfangs davor, nicht der Schnitt der Pausenwochen', () => {
    const runs = ranPlan(TODAY, ['2026-12-14', '2026-12-27'])
    const b = rebuildBase({ runs, pauses: [{ id: 'p', kind: 'krank', from: '2026-12-14', to: '2026-12-27' }], today: TODAY })
    expect([b.source, b.runsKm, b.pauseDays, b.share]).toEqual(['return', 0, 14, 0.7])
    expect(b.km).toBe(Math.round(0.7 * b.beforeKm! * 2) / 2)
    expect(b.text).toMatch(/Wiedereinstieg nach 14 Tagen Pause: 70 % von/)
  })
  it('ab 28 Tagen Pause: 50 %; unter 4 Tagen zählt die Pause nicht; gelaufen schlägt geschätzt', () => {
    const long = rebuildBase({ runs: before(8, 50), pauses: [{ id: 'p', kind: 'pause', from: '2026-12-01', to: null }], today: TODAY })
    expect([long.pauseDays, long.share, long.km]).toEqual([30, 0.5, 25])
    const short = rebuildBase({ runs: ranPlan(TODAY), pauses: [{ id: 'p', kind: 'krank', from: '2026-12-22', to: '2026-12-24' }], today: TODAY })
    expect(short.source).toBe('runs2')
    const ran = rebuildBase({ runs: ranPlan(TODAY), pauses: [{ id: 'p', kind: 'krank', from: '2026-12-01', to: '2026-12-05' }], today: TODAY })
    expect([ran.source, ran.km]).toEqual(['runs2', ran.runsKm])
  })
  it('die Quelle steht in der Begründung der Spitze', () => {
    const r = ok(rebuild(input()))
    expect(r.draft.skeleton.peak.why.join(' ')).toContain('Schnitt deiner letzten 2 Wochen')
  })
})

describe('Datenprüfung (AC-5)', () => {
  const measured = { recentRace: null, longest30Km: 18 }
  it('gut ab 3 von 4 Wochen mit Läufen, dünn bei 1–2, fehlend ohne Lauf', () => {
    const check = (runs: RunRow[]) => dataCheck({ runs, today: TODAY, base: rebuildBase({ runs, pauses: [], today: TODAY }), measured, profile: PROFILE }).base
    expect(check(ranPlan(TODAY))).toMatchObject({ state: 'good', weeksWithRuns: 4 })
    expect(check(ranPlan(TODAY, ['2026-11-30', '2026-12-13']))).toMatchObject({ state: 'thin', weeksWithRuns: 2 })
    expect(check([])).toMatchObject({ state: 'missing', weeksWithRuns: 0 })
    expect(check([]).text).toContain('bitte deinen Wochenumfang eintragen')
  })
  it('Zielzeit: prüfbar nur mit Wettkampf oder Schwellentest', () => {
    const base = rebuildBase({ runs: ranPlan(TODAY), pauses: [], today: TODAY })
    expect(dataCheck({ runs: [], today: TODAY, base, measured, profile: PROFILE }).goal.state).toBe('unchecked')
    expect(dataCheck({ runs: [], today: TODAY, base, measured, profile: { ...PROFILE, thresholdPaceS: 250 } }).goal.state).toBe('checked')
    expect(dataCheck({ runs: [], today: TODAY, base, measured: { ...measured, recentRace: { distanceKm: 10, timeS: 2400, date: '2026-10-04' } }, profile: PROFILE }).goal.text).toContain('4.10.2026')
  })
  it('ohne Läufe: kein Neuaufbau ohne eingetragenen Umfang, mit ihm schon', () => {
    const none = rebuild(input({ runs: [] }))
    expect(none).toMatchObject({ ok: false, needs: 'currentKm' })
    const typed = ok(rebuild(input({ runs: [], change: { currentKm: 40 } })))
    expect(typed.reasons.join(' ')).toContain('40 km pro Woche, von dir eingetragen')
    expect(typed.draft.inputs.currentKm).toMatchObject({ value: 40, override: true })
  })
})

describe('Hebel und Vorschau (AC-2)', () => {
  it('Zielzeit: neues Renntempo im Rest, Begründung mit beiden Zeiten; die Vergangenheit behält ihr Tempo', () => {
    const r = ok(rebuild(input({ change: { goalS: 5220 } })))
    expect(r.goal.goalS).toBe(5220)
    expect(r.block.race.goalS).toBe(5220)
    expect(r.after.racePace).not.toBe(r.before.racePace)
    expect(r.reasons.find((x) => x.startsWith('Zielzeit'))).toMatch(/Zielzeit 1:25:00 → 1:27:00: Renntempo \d:\d\d → \d:\d\d\/km/)
    expect(r.block.sessions.filter((s) => s.date < r.cut)).toEqual(block.sessions.filter((s) => s.date < r.cut))
  })
  it('Renndatum später: mehr Wochen, das Rennen am neuen Tag, der alte Renntag ist ein normaler Tag', () => {
    const r = ok(rebuild(input({ change: { raceDate: '2027-03-14' } })))
    expect(r.after.weeks).toBe(r.before.weeks + 2)
    expect(r.block.race.date).toBe('2027-03-14')
    expect(r.block.sessions.filter((s) => s.type === 'race').map((s) => s.date)).toEqual(['2027-03-14'])
    expect(r.reasons.join(' ')).toContain('Rennen 28.2.2027 → 14.3.2027')
    expect(r.weeks[r.weeks.length - 1].before).toBeNull()
  })
  it('Renndatum früher: weniger Wochen; zu früh wird abgelehnt', () => {
    const r = ok(rebuild(input({ change: { raceDate: '2027-02-14' } })))
    expect(r.after.weeks).toBe(r.before.weeks - 2)
    expect(rebuild(input({ change: { raceDate: '2027-01-17' } }))).toMatchObject({ ok: false, error: expect.stringContaining('Wochenansicht') })
  })
  it('Methode: Regeln und Vorlagenname des Blocks wechseln', () => {
    const other = listMethodologies().valid.find((m) => m.meta.distances.includes('half') && m.id !== 'pfitzinger-half')!
    const r = ok(rebuild(input({ change: { templateId: other.id }, template: other.params, templateLabel: other.meta.name })))
    expect(r.block.rules[0]).toContain(other.meta.name)
    expect(r.reasons.join(' ')).toContain(`Methode: ${other.meta.name} statt Pfitzinger`)
  })
  it('Alltag: weniger Lauftage stehen im Rest und in der Begründung', () => {
    const profile = { ...PROFILE, availableDays: [2, 4, 6, 7] as AthleteProfile['availableDays'], qualityDays: [2, 4] as AthleteProfile['qualityDays'], restDay: null }
    const r = ok(rebuild(input({ profile })))
    const days = new Set(r.block.sessions.filter((s) => s.date >= r.cut && s.date < hm.date && s.type !== 'rest' && (s.km ?? 0) > 0).map((s) => new Date(`${s.date}T12:00:00Z`).getUTCDay() || 7))
    expect([...days].every((d) => [2, 4, 6, 7].includes(d))).toBe(true)
    expect(r.reasons.join(' ')).toMatch(/Lauftage: .* → Di, Do, Sa, So \(6 → 4 pro Woche\)/)
  })
  it('Vorschau: eine Zeile pro Woche ab dem Schnitt, Summen alt und neu, jede Begründung mit Zahl', () => {
    const r = ok(rebuild(input({ runs: [...before(8, 50), ...ranPlan(TODAY, ['2026-12-14', '2026-12-27'])], pauses: [{ id: 'p', kind: 'krank', from: '2026-12-14', to: '2026-12-27' }] })))
    expect(r.weeks[0].start).toBe(r.cut)
    expect(r.weeks.every((w) => w.before && w.after)).toBe(true)
    expect(r.before.peakKm).toBeGreaterThan(r.after.peakKm)
    expect(r.reasons.find((x) => x.startsWith('Spitze'))).toMatch(/Spitze [\d,]+ → [\d,]+ km/)
    expect(r.reasons.every((x) => /\d/.test(x))).toBe(true)
    expect(r.after.restKm).toBeLessThan(r.before.restKm)
  })
})

describe('Zu spät (AC-3)', () => {
  it('unter Taper + 3 Wochen: Ablehnung mit dem Hinweis auf die Wochenansicht', () => {
    expect(tooLate(template, hm, '2027-01-25')).toBeNull()                 // 5 weeks, taper 2
    expect(tooLate(template, hm, '2027-02-01')).toMatch(/noch 4 Wochen: zu kurz .*mindestens 5.*Wochenansicht/)
    expect(rebuild(input({ today: '2027-01-27', runs: ranPlan('2027-01-27') }))).toMatchObject({ ok: false, error: expect.stringContaining('Wochenansicht') })
  })
  it('nach dem Rennen und für Blöcke ohne Generator gibt es keinen Neuaufbau', () => {
    expect(rebuild(input({ today: '2027-03-02' }))).toMatchObject({ ok: false, error: expect.stringContaining('vorbei') })
    expect(rebuild(input({ block: { ...block, base: true } }))).toMatchObject({ ok: false })
  })
  it('ein späteres Rennen darf keinen anderen Plan überdecken', () => {
    const other = { ...block, id: 'gen-other', planStart: '2027-03-15', end: '2027-06-01', race: { ...block.race, name: 'Sommerlauf' } }
    expect(rebuild(input({ change: { raceDate: '2027-03-14' }, others: [other] }))).toMatchObject({ ok: false, error: expect.stringContaining('Sommerlauf') })
    expect(rebuild(input({ others: [other] })).ok).toBe(true)
  })
})

describe('Änderungen und Rückgängig (AC-6)', () => {
  it('eigene Änderungen ab dem Schnitt gehen, die davor bleiben', () => {
    const edit = (date: string) => ({ date, type: 'easy' as const, km: 5, title: 'x' })
    const { kept, removed } = splitEdits({ '2026-12-31': edit('2026-12-31'), '2027-01-04': edit('2027-01-04'), '2027-04-01': edit('2027-04-01') }, '2027-01-04', block.end)
    expect([Object.keys(kept), Object.keys(removed)]).toEqual([['2026-12-31', '2027-04-01'], ['2027-01-04']])
  })
  it('Rückgängig vor dem Schnitt gibt den alten Block zurück; später bleibt, was schon geplant war', () => {
    const r = ok(rebuild(input({ change: { goalS: 5220 } })))
    const same = undoBlock(r.block, block, '2027-01-02')
    expect('block' in same && same.block).toEqual(block)
    const later = undoBlock(r.block, block, '2027-01-13')
    if (!('block' in later)) throw new Error(later.error)
    expect(later.from).toBe('2027-01-18')
    expect(later.block.sessions.filter((s) => s.date < '2027-01-18')).toEqual(r.block.sessions.filter((s) => s.date < '2027-01-18'))
    expect(later.block.sessions.filter((s) => s.date >= '2027-01-18')).toEqual(block.sessions.filter((s) => s.date >= '2027-01-18'))
    expect(later.block.race).toEqual(block.race)
    expect(undoBlock(r.block, block, '2027-03-05')).toHaveProperty('error')
  })
  it('nur der neueste aktive Neuaufbau eines Blocks lässt sich zurücknehmen', () => {
    const e = (id: string, at: string, status: RebuildEntry['status'] = 'active') => ({ id, at, blockId: 'b', status, undo: {} } as unknown as RebuildEntry)
    const list = [e('1', '2027-01-01'), e('2', '2027-01-02'), e('3', '2027-01-03', 'undone')]
    expect(list.map((x) => undoable(list, x))).toEqual([false, true, false])
  })
})

describe('Eigenschaften (AC-8)', () => {
  it('für jeden Tag, jede Zielzeit und jedes Renndatum: Vergangenheit unverändert, Rest besteht die Generator-Prüfungen', () => {
    fc.assert(fc.property(fc.integer({ min: -20, max: 60 }), fc.integer({ min: 4800, max: 6600 }), fc.integer({ min: -2, max: 4 }), fc.boolean(),
      (day, goalS, shift, paused) => {
        const today = plus('2026-11-30', day)
        const raceDate = plus(hm.date, shift * 7)
        const skip: [string, string] | undefined = paused ? [plus(today, -16), plus(today, -3)] : undefined
        const r = rebuild(input({ today, change: { goalS, raceDate }, runs: [...before(8, 50), ...ranPlan(today, skip)],
          pauses: skip ? [{ id: 'p', kind: 'krank', from: skip[0], to: skip[1] }] : [] }))
        if (!r.ok) return
        expect(r.block.sessions.filter((s) => s.date < r.cut)).toEqual(block.sessions.filter((s) => s.date < r.cut))
        expect(r.block.weeks.filter((w) => w.start < r.cut)).toEqual(block.weeks.filter((w) => w.start < r.cut))
        expect(r.block.sessions.map((s) => s.date)).toEqual([...new Set(r.block.sessions.map((s) => s.date))].sort())
        const goal = { ...hm, date: raceDate, goalS }
        const base = { template, distance: 'half' as const, raceDate, raceName: goal.name, profile: PROFILE, goalS, recentRace: null }
        const rest = r.block.sessions.filter((s) => s.date >= r.cut && s.date <= r.draft.days.weeks[r.draft.days.weeks.length - 1].end)
        expect(checkDays({ ...r.draft.days, sessions: rest }, r.draft.skeleton, { ...base, racePaceS: r.draft.paces.racePaceS,
          longest30Km: r.draft.inputs.longest30Km.value ?? 0, longest12mKm: 42.2 })).toEqual([])
        expect(checkWorkouts({ ...r.draft.workouts, sessions: rest }, r.draft.days, r.draft.skeleton, base)).toEqual([])
      }), { numRuns: 60 })
  })
})
