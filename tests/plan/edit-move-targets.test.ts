// 08-02 follow-up: the week editor offered every day from today to the end of next week as a move target, also days
// before the plan's first week or after its last one. A session moved there was stored but vanished from the editor
// (no week shows that day), and selecting the target day after the move broke the editor. Targets are now days of
// the plan's weeks only.
import { describe, expect, it } from 'vitest'
import { effectiveSessions, moveTargets, planWeeks, weekDates } from '@/lib/plan/effective'

describe('Ziele beim Verschieben', () => {
  // Example block: weeks 28.9.–29.11., race 8.11., recovery weeks after it.
  const none = new Map<string, number>()
  const plan = effectiveSessions({})
  const shown = new Set(planWeeks().flatMap(weekDates))

  it('vor dem Plan: kein Tag vor seiner ersten Woche', () => {
    const t = moveTargets('2026-09-28', '2026-09-20', plan, none)
    expect(t.map((x) => x.date).filter((d) => !shown.has(d))).toEqual([])
    expect(t.map((x) => x.date)).toContain('2026-09-30')          // days of the plan stay targets
  })

  it('nach dem Plan: kein Tag nach seiner letzten Woche', () => {
    const t = moveTargets('2026-11-24', '2026-11-20', plan, none)
    expect(t.map((x) => x.date).filter((d) => !shown.has(d))).toEqual([])
    expect(t.length).toBeGreaterThan(0)
    expect(t.every((x) => x.date <= '2026-11-29')).toBe(true)
  })

  it('mitten im Plan: bis Ende nächster Woche, auch in die nächste Woche', () => {
    const t = moveTargets('2026-10-01', '2026-09-30', plan, none)
    expect(t.map((x) => x.date)).toEqual(expect.arrayContaining(['2026-10-02', '2026-10-05', '2026-10-13']))
    expect(t.find((x) => x.date === '2026-10-02')).toMatchObject({ modes: ['move'], state: { status: 'rest' } })
  })
})
