// End of a generated block (07-22; logic audit 2026-10-26, findings 10 and 12): no long run or key session in the
// 6 days before the race on any weekday.
import { describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { type SeasonGoal } from '@/lib/season/goals'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'

const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const templates = listMethodologies().valid
const draftFor = (id: string, goal: SeasonGoal, profile = RUNNER) => {
  const t = templates.find((m) => m.id === id)!.params
  return generateDraft({ goal, template: t, start: '2026-11-30', profile,
    measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
}

describe('Letzte Tage vor dem Rennen, jeder Wochentag (F10)', () => {
  // Mon 1.3., Wed 3.3., Sat 27.2., Sun 28.2.2027
  for (const date of ['2027-03-01', '2027-03-03', '2027-02-27', '2027-02-28']) {
    for (const m of templates.filter((x) => x.params.distances.includes('half'))) {
      for (const longRunDay of [6, 7] as const) {
        it(`${m.id}, Rennen ${date}, Longrun-Tag ${longRunDay}`, () => {
          const d = draftFor(m.id, { ...hm, date }, { ...RUNNER, longRunDay })
          expect('ok' in d ? d.ok : true).not.toBe(false)
          const last6 = d.workouts.sessions.filter((s) => s.date >= day(date, -6) && s.date < date)
          expect(last6.filter((s) => s.type === 'long').map((s) => s.date)).toEqual([])
          expect(last6.filter((s) => s.key && s.date < day(date, -3)).map((s) => s.date), 'key only as race-week reminder (−3/−4)').toEqual([])
          expect(d.workouts.sessions.find((s) => s.date === day(date, -2))?.type ?? 'rest').not.toBe('long')
        })
      }
    }
  }
})

// ─── Recovery weeks after the race (F12) ──────────────────────────────────────
import { afterEach } from 'vitest'
import { freezeDraft, goLiveError } from '@/lib/plan/generator/freeze'
import { POST_RACE } from '@/lib/plan/generator/recovery'
import { blockFor, registerLiveBlocks } from '@/lib/plan/blocks'
import { rulesFor } from '@/lib/plan/rules'
import { parseStructure, totalKm } from '@/lib/plan/structure'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import { paceToS } from '@/lib/plan/format'
import { recoveryStatus } from '@/lib/insights/recovery'

afterEach(() => registerLiveBlocks([]))
const marathonGoal: SeasonGoal = { id: 'm-2027', kind: 'marathon', priority: 'A', name: 'Marathon 2027', date: '2027-04-25', confirmed: false, distanceKm: null, goalS: 3 * 3600 + 2 * 60, loops: null }

describe('Erholungswochen nach dem Rennen (F12)', () => {
  for (const [id, goal, n] of [['pfitzinger-half', hm, 2], ['polarized-80-20-half', hm, 2], ['pfitzinger-marathon', marathonGoal, 3]] as const) {
    it(`${id}: ${n} Wochen, Anteile der letzten Belastungswoche, Woche 1 nur kurz und locker`, () => {
      const d = draftFor(id, goal)
      const b = freezeDraft(d, goal, id, templates.find((m) => m.id === id)!.params)
      const rec = b.weeks.filter((w) => w.recovery)
      expect(rec).toHaveLength(n)
      expect(rec[0].start).toBe(day(goal.date, 1))            // race on Sunday: recovery starts Monday
      expect(b.end).toBe(rec[n - 1].end)
      const load = d.days.weeks.filter((w) => !w.taper && !w.cutback).at(-1)!
      const shares = POST_RACE.shares[d.distance]
      rec.forEach((w, k) => expect(w.km, w.focus).toBeLessThanOrEqual(shares[k] * load.km + 1e-9))
      const inW = (w: { start: string; end: string }) => b.sessions.filter((s) => s.date >= w.start && s.date <= w.end)
      const easyS = paceToS(b.paces!.easy)
      for (const s of inW(rec[0])) {
        expect(s.type === 'long' || s.key || !!s.pace, s.date).toBe(false)
        if (s.km) expect(s.km * easyS, s.date).toBeLessThanOrEqual(POST_RACE.week1MaxMin * 60 + 1e-9)
      }
      for (const s of rec.flatMap(inW)) {
        expect(s.key, s.date).toBeFalsy()
        if (s.pace) expect(totalKm(parseStructure(s.notes)!), s.date).toBeCloseTo(s.km!, 5)
      }
      expect(rec.flatMap(inW).filter((s) => s.type === 'tempo')).toHaveLength(1)   // one short threshold in the last week
      // After race day the block's own rules apply, and the next block cannot start inside the recovery.
      registerLiveBlocks([b])
      expect(blockFor(day(goal.date, 1))?.id).toBe(b.id)
      expect(rulesFor(day(goal.date, 1))).toEqual(b.engine)
      const card = recoveryStatus({ today: day(goal.date, 1), sessions: b.sessions, runs: [], fitness: [] })   // Erholung card + header count
      expect(card.lines[0].text).toContain(`Woche 1/${n}`)
      expect(card.note).toMatch(n === 2 ? /^Zwei Wochen/ : /^Drei Wochen/)
      expect(goLiveError({ ...b, id: 'next', planStart: day(goal.date, 8), end: '2027-12-31' }, [PORTO_2026, b], '2026-10-27')).toContain('Überschneidet sich')
    })
  }
})
