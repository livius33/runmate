// Findings from the harness (07-00), each reproduced with fixed inputs and fixed in 07-11. A new finding is added
// here as `it.fails` (the test states the rule, today's code breaks it) until its fix lands.
import { describe, expect, it } from 'vitest'
import { EMPTY_ENGINE, runEngine } from '@/lib/plan/engine'
import { effectiveSessions, isHard, setDayKm } from '@/lib/plan/effective'
import { weekOf } from '@/lib/plan/blocks'
import { periodFor, recentVolume, suggestions } from '@/lib/plan/workshop'
import { makeRun } from './arbitraries'

const RED = { tsb: -26, acwr: null }

describe('Befunde Plan-Engine', () => {
  // F-01: in the red zone, missed-key moves a missed session into the next days (it runs after the fatigue
  // guard), and the next engine run softens the moved session. Two runs on the same day → different plans.
  it('F-01 zweiter Engine-Lauf am selben Tag ändert nichts (rote Zone)', () => {
    const input = { today: '2026-10-12', manual: {}, runs: [], fitness: RED, syncedThrough: '2026-10-11' }
    const first = runEngine({ ...input, at: 'A', state: EMPTY_ENGINE })
    const second = runEngine({ ...input, at: 'B', state: first.state })
    expect(second.added.map((c) => c.reason)).toEqual([])
  })

  // F-02: while tired, the engine still moves a hard key session into the fatigue window (today … +2):
  // after F-01 softens Tuesday, the 28-km race-pace long run is moved onto Monday — today, TSB −26.
  it('F-02 keine harte Einheit wird in der roten Zone in die nächsten 3 Tage verschoben', () => {
    const input = { today: '2026-10-12', manual: {}, runs: [], fitness: RED, syncedThrough: '2026-10-11' }
    let state = EMPTY_ENGINE
    for (const at of ['A', 'B']) state = runEngine({ ...input, at, state }).state
    const window = ['2026-10-12', '2026-10-13', '2026-10-14']
    const moved = state.log.filter((c) => c.rule === 'missed-key' && c.status === 'active')
      .flatMap((c) => Object.entries(c.after)).filter(([d, s]) => window.includes(d) && isHard(s))
    expect(moved.map(([d, s]) => `${d} ${s.title}`)).toEqual([])
  })

  // F-03: the self-correction takes back a rebalance addition on a day that is already past and run:
  // Thursday's planned km change on Sunday. The log also names the wrong cause ("Lauf nachträglich
  // synchronisiert" — the real cause was a long extra run on Saturday).
  it('F-03 Rücknahme eines Ausgleichs ändert keinen vergangenen Tag', () => {
    const runs = [makeRun('2026-09-28', 8, 330, 130), makeRun('2026-09-29', 18, 263, 160), makeRun('2026-09-30', 14, 340, 130),
      makeRun('2026-10-01', 13, 345, 130), makeRun('2026-10-03', 42, 265, 150)]
    const fitness = { tsb: 0, acwr: 1 }
    const thu = runEngine({ today: '2026-10-01', at: 'A', manual: {}, state: EMPTY_ENGINE, runs: runs.slice(0, 1), fitness, syncedThrough: '2026-09-28' })
    const sun = runEngine({ today: '2026-10-04', at: 'B', manual: {}, state: thu.state, runs, fitness, syncedThrough: '2026-10-03' })
    const plannedThu = (o: Record<string, unknown>) => effectiveSessions({}, o as never).find((s) => s.date === '2026-10-01')?.km
    expect(plannedThu(sun.state.overrides)).toBe(plannedThu(thu.state.overrides))
  })

  // F-04 (rule decided 2026-10-23): a missed test may be caught up until the day before the taper — unless another
  // test comes before then; that one decides Plan A/B. Before the fix the engine moved the Generalprobe even with the
  // Hella-HM (finaler Test) four days before the taper.
  it('F-04 Generalprobe bleibt, wenn vor dem Taper noch ein Test kommt', () => {
    const manual = setDayKm({}, '2026-10-18', 0, effectiveSessions({}))
    const r = runEngine({ today: '2026-10-17', at: 'A', manual, state: EMPTY_ENGINE, runs: [], fitness: { tsb: 0, acwr: 1 }, syncedThrough: '2026-10-16' })
    expect(r.added.filter((c) => c.status === 'active' && c.key === 'missed-key:2026-10-16').map((c) => c.reason)).toEqual([])
    expect(r.added.find((c) => c.key === 'missed-key:2026-10-16')?.reason).toContain('Hella-Halbmarathon')
  })
  it('F-04 ohne weiteren Test wird die Generalprobe vor dem Taper nachgeholt', () => {
    const manual = {
      ...setDayKm({}, '2026-10-18', 0, effectiveSessions({})),
      '2026-10-25': { date: '2026-10-25', type: 'easy' as const, km: 10, title: 'Lockerer Lauf' },   // no Hella-HM
    }
    const r = runEngine({ today: '2026-10-17', at: 'A', manual, state: EMPTY_ENGINE, runs: [], fitness: { tsb: 0, acwr: 1 }, syncedThrough: '2026-10-16' })
    const moved = r.added.find((c) => c.status === 'active' && c.key === 'missed-key:2026-10-16')
    const target = Object.entries(moved?.after ?? {}).find(([, s]) => s.test)?.[0]
    expect(target).toBeDefined()
    expect(target! < '2026-10-26').toBe(true)   // before the first taper week
  })
})

describe('Befunde Plan anpassen', () => {
  // F-05: "Schlüsseleinheit nachholen" only checks hard days ±1 around the new day; the engine and the 07-10 plan
  // require no other key session within ±2 days. Tuesday's missed race-pace blocks land on Thursday, two days
  // before Saturday's race-pace long run.
  it('F-05 nachgeholte Schlüsseleinheit hält ±2 Tage Abstand zur nächsten', () => {
    const today = '2026-09-30'
    const runs = [makeRun('2026-09-28', 20, 345, 130)]
    const actual = new Map(runs.map((r) => [r.date, r.km]))
    const sessions = effectiveSessions({})
    const s = suggestions({ today, period: periodFor({ kind: 'weeks', weeks: 2 }, today, []), sessions, manual: {}, actual,
      fitness: { tsb: 0, acwr: 1 }, events: [], profile: null, recent: recentVolume(today, sessions, actual) })
    expect(s.filter((x) => x.kind === 'key-catchup').flatMap((x) => Object.keys(x.changes))).not.toContain('2026-10-01')
  })

  // F-06: "Umfang erhöhen" adds km in the recovery weeks after Porto (KW46–48, protected from the engine since 06-01);
  // volume() and finalize() only skip taper weeks. In the simulation it fires after almost every race, because
  // recentVolume() counts the marathon's 42 km as run but not as planned (ratio > 115 %). Here: runs 30 % above plan
  // in the last 3 weeks → +10 % on 24.–26.11.
  it('F-06 Erholungswochen bekommen keine zusätzlichen km', () => {
    const today = '2026-11-23'
    const sessions = effectiveSessions({})
    const actual = new Map(sessions.filter((s) => s.date >= '2026-11-02' && s.date < today && s.type !== 'rest' && s.type !== 'race')
      .map((s) => [s.date, Math.round((s.km ?? 0) * 1.3 * 10) / 10] as [string, number]))
    const s = suggestions({ today, period: periodFor({ kind: 'weeks', weeks: 1 }, today, []), sessions, manual: {}, actual,
      fitness: { tsb: 0, acwr: 1 }, events: [], profile: null, recent: recentVolume(today, sessions, actual) })
    const gains = s.flatMap((x) => Object.entries(x.changes))
      .filter(([d, a]) => weekOf(d)?.recovery && (a.km ?? 0) > (sessions.find((b) => b.date === d)?.km ?? 0))
    expect(gains.map(([d]) => d)).toEqual([])
  })
})

describe('07-12: Testläufe in Plan anpassen, Urlaubswochen', () => {
  const noHm = { '2026-10-25': { date: '2026-10-25', type: 'easy' as const, km: 10, title: 'Lockerer Lauf' } }
  const review = (today: string, manual: Record<string, never> | typeof noHm) => {
    const sessions = effectiveSessions(manual)
    const actual = new Map<string, number>()
    return suggestions({ today, period: periodFor({ kind: 'weeks', weeks: 2 }, today, []), sessions, manual, actual,
      fitness: { tsb: 0, acwr: 1 }, events: [], profile: null, recent: recentVolume(today, sessions, actual) })
  }

  it('Plan anpassen schlägt die Generalprobe nicht vor, wenn vor dem Taper noch ein Test kommt', () => {
    const s = review('2026-10-17', {})
    expect(s.filter((x) => x.kind === 'key-catchup' && x.title.startsWith('Generalprobe')).map((x) => x.title)).toEqual([])
  })

  it('Plan anpassen holt die Generalprobe vor dem Taper nach, wenn kein weiterer Test kommt', () => {
    const c = review('2026-10-17', noHm).find((x) => x.kind === 'key-catchup' && x.title.startsWith('Generalprobe'))
    const target = Object.keys(c?.changes ?? {})[0]
    expect(target).toBeDefined()
    expect(target > '2026-10-17' && target < '2026-10-26').toBe(true)
    expect(c!.why.join(' ')).toContain('Tag vor dem Taper')
  })

  it('Urlaubswochen blockieren das Verschieben nicht mehr (Engine)', () => {
    // Generalprobe 16.10. missed, no Hella-HM: on Mon 19.10. the engine may move it into KW43 (flagged holiday).
    const r = runEngine({ today: '2026-10-19', at: 'A', manual: noHm, state: EMPTY_ENGINE, runs: [], fitness: { tsb: 0, acwr: 1 }, syncedThrough: '2026-10-18' })
    const moved = r.added.find((c) => c.status === 'active' && c.key === 'missed-key:2026-10-16')
    const target = Object.entries(moved?.after ?? {}).find(([, s]) => s.test)?.[0]
    expect(target).toBeDefined()
    expect(weekOf(target!)?.holiday).toBe(true)
  })
})
