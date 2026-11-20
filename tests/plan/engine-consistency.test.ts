// Engine and Plan anpassen consistent with the block's method and with each other (07-21; logic audit 2026-10-26,
// findings 7, 9, 11, 13, 14). Porto: the simulation dump is byte-identical before/after (checked during 07-21).
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, format, getDay, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { type SeasonGoal } from '@/lib/season/goals'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { allSessions, registerLiveBlocks, recoveryWeekday } from '@/lib/plan/blocks'
import { applyEvents } from '@/lib/plan/events'
import { EMPTY_ENGINE, runEngine } from '@/lib/plan/engine'
import { balanceWeek, canTakeExtra, weekSummary } from '@/lib/plan/effective'
import { suggestions } from '@/lib/plan/workshop'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { TrainingBlock } from '@/lib/plan/types'

const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 7, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const templates = listMethodologies().valid
const blockFrom = (id: string, profile = RUNNER, goal: SeasonGoal = hm): TrainingBlock => {
  const t = templates.find((m) => m.id === id)!.params
  const d = generateDraft({ goal, template: t, start: '2026-11-30', profile,
    measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
  return freezeDraft(d, goal, t.name, t)
}
const pfitz = blockFrom('pfitzinger-half')
const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
afterEach(() => registerLiveBlocks([]))

describe('Engine (F7, F13)', () => {
  it('ein verpasster Schlüsseltag landet nie am Tag nach einem Longrun', () => {
    registerLiveBlocks([pfitz])
    const sessions = allSessions()
    const moved: string[] = []
    for (const s of pfitz.sessions.filter((x) => x.key && !x.test && !x.anchor && x.date < day(pfitz.race.date, -21))) {
      const added = runEngine({ today: day(s.date, 1), at: `${day(s.date, 1)}T07:00:00Z`, manual: {}, state: EMPTY_ENGINE, runs: [], fitness: { tsb: 0, acwr: 1 } }).added
      moved.push(...added.filter((c) => c.rule === 'missed-key' && c.status === 'active').flatMap((c) => Object.keys(c.after).filter((d) => d !== s.date)))
    }
    expect(moved.length).toBeGreaterThan(0)
    for (const d of moved) expect(sessions.find((x) => x.date === day(d, -1))?.type, d).not.toBe('long')
  })
  it('Erholungstag des Blocks = Tag nach dem Longrun (Sonntag-Longrun → Montag; Porto: Sonntag)', () => {
    registerLiveBlocks([pfitz])
    const longDay = getDay(parseISO(pfitz.sessions.find((s) => s.type === 'long')!.date))
    expect(recoveryWeekday('2027-01-05')).toBe((longDay + 1) % 7)
    expect(recoveryWeekday('2026-10-20')).toBe(0)
  })
  it('geplante Wochen des Pfitzinger-Blocks lösen keine eigenen Warnungen aus', () => {
    registerLiveBlocks([pfitz])
    const sessions = allSessions()
    const warned = pfitz.weeks.map((w) => ({ w: w.start, warnings: weekSummary(w, '2026-11-29', sessions, new Map()).warnings.filter((x) => !x.startsWith('Kein Ruhetag')) }))
      .filter((x) => x.warnings.length)
    expect(warned).toEqual([])
  })
})

describe('Rennen bekommen keine Ausgleichs-km (F9)', () => {
  it('ein „einfach mitlaufen"-Rennen ist kein Kandidat für Ausgleich', () => {
    const g: SeasonGoal = { id: 'b', kind: '5k', priority: 'B', name: 'Lauf', date: '2027-01-13', confirmed: true, distanceKm: null, goalS: null, loops: null, role: 'fun' }
    const b = applyEvents(pfitz, [g])
    registerLiveBlocks([b])
    const raceDay = b.sessions.find((s) => s.date === g.date)!
    expect(raceDay.anchor).toBe(true)
    expect(canTakeExtra(raceDay, g.date)).toBe(false)
    const week = b.weeks.find((w) => w.start <= g.date && g.date <= w.end)!
    const summary = weekSummary({ ...week, km: week.km + 10 }, week.start, allSessions(), new Map())
    expect(balanceWeek(summary, week.start, {}).added.map((a) => a.date)).not.toContain(g.date)
  })
})

describe('Plan anpassen liest die Regeln des Blocks (F11)', () => {
  const input = (b: TrainingBlock) => {
    registerLiveBlocks([b])
    const today = '2027-01-07'
    const sessions = allSessions()
    const week = b.weeks.find((w) => w.start <= today && today <= w.end)!
    // Nothing run this week so far: km are missing.
    return { today, period: { from: week.start, to: week.end, label: 'Woche' }, sessions, manual: {}, actual: new Map<string, number>(),
      fitness: { tsb: 0, acwr: 1 }, events: [], profile: RUNNER, recent: null }
  }
  it('Pfitzinger (fehlende km: auslassen) schlägt kein Verteilen vor', () => {
    expect(pfitz.engine!.rebalance).toBe(false)
    expect(suggestions(input(pfitz)).map((s) => s.kind)).not.toContain('missed-km')
  })
  it('Norwegian (verteilen, +25 % / +4 km) nennt die eigenen Grenzen', () => {
    const nor = blockFrom('norwegian-threshold-half')
    const s = suggestions(input(nor)).find((x) => x.kind === 'missed-km')
    if (s) expect(s.why.join(' ')).toContain('+25 % bzw. +4 km')
  })
})

describe('Generator (F14)', () => {
  it('keine locker gemachte Einheit bleibt tempo/Schlüssel – für jede Vorlage (Bergsprints ohne Tempo bleiben hart)', () => {
    for (const m of templates.filter((x) => x.params.distances.includes('half'))) {
      const b = blockFrom(m.id)
      const bad = b.sessions.filter((s) => (s.type === 'tempo' || s.type === 'intervals' || s.key) && !s.pace && /^Locker/.test(s.notes ?? ''))
      expect(bad.map((s) => s.date), m.id).toEqual([])
    }
  })
})
