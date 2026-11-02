// AC-6 (Phase 5): the demo athlete is deterministic (same day → byte-identical data), tells the same story on every
// weekday (missed key session caught up, Krank with the graded return, the fatigue guard, cross-training, feedback),
// and carries no real personal data. The generator runs in the demo user's scope like the seed script.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { builtInBlocks, registerBuiltInBlocks } from '@/lib/plan/blocks'
import { effectiveSessions } from '@/lib/plan/effective'
import { runAsUser } from '@/lib/server/scope'
import { DEMO_PROFILE, DEMO_USER_ID } from '@/lib/demo/athlete'
import { generateDemo, type DemoData } from '@/lib/demo/generate'
import type { EngineState } from '@/lib/plan/engine'
import type { Pause } from '@/lib/plan/pause'

const saved = builtInBlocks()
beforeAll(() => registerBuiltInBlocks([]))       // the example plan file (tests/setup.ts) would overlap the demo block
afterAll(() => registerBuiltInBlocks(saved))

const asDemo = <T,>(fn: () => T) => runAsUser(DEMO_USER_ID, async () => fn(), { profile: DEMO_PROFILE })
const plus = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const DAYS = Array.from({ length: 7 }, (_, i) => plus('2026-11-02', i))   // every weekday once

describe('Demo-Athletin', () => {
  it('gleicher Tag → byteweise gleiche Daten', async () => {
    const a = JSON.stringify(await asDemo(() => generateDemo('2026-11-04')))
    const b = JSON.stringify(await asDemo(() => generateDemo('2026-11-04')))
    expect(a).toBe(b)
    expect(a.length).toBeLessThan(3_000_000)
  })

  it('nur im Scope des Demo-Nutzers', async () => {
    await expect(runAsUser('user_real', async () => generateDemo('2026-11-02'), { profile: null })).rejects.toThrow(/demo user/)
  })

  for (const today of DAYS) {
    it(`erzählt dieselbe Geschichte am ${today}`, async () => {
      const d: DemoData = await asDemo(() => {
        const data = generateDemo(today)
        // The return after the pause is capped (lib/plan/pause.ts): the effective sessions of the return week are lower.
        const pauses = data.settings.plan_pauses as Pause[]
        const engine = data.settings.plan_engine as EngineState
        const back = plus(data.story.krank.to, 1)
        const capped = effectiveSessions({}, engine.overrides, { pauses, today })
          .filter((s) => s.date >= back && s.date <= plus(back, 6))
        const plain = data.block.sessions.filter((s) => s.date >= back && s.date <= plus(back, 6))
        const km = (l: { km?: number; type: string }[]) => l.reduce((t, s) => t + (s.type === 'rest' ? 0 : s.km ?? 0), 0)
        expect(km(capped)).toBeLessThan(km(plain))
        return data
      })
      expect(d.block.race.name).toBe('Hamburg HM')
      expect(d.block.weeks.filter((w) => w.start <= d.block.race.date)).toHaveLength(12)
      const week = d.block.weeks.findIndex((w) => w.start <= today && today <= w.end) + 1
      expect(week).toBe(9)

      const engine = d.settings.plan_engine as EngineState
      const active = engine.log.filter((c) => c.status === 'active')
      expect(active.filter((c) => c.rule === 'missed-key').map((c) => c.key)).toEqual([`missed-key:${d.story.missedKey}`])
      expect(active.some((c) => c.rule === 'fatigue' && c.key > `fatigue:${d.story.overdoWeek}`)).toBe(true)
      expect(d.activities.some((a) => a.date === d.story.missedKey)).toBe(false)
      expect((d.settings.plan_pauses as Pause[])).toEqual([{ id: 'demo-krank', kind: 'krank', ...d.story.krank }])
      expect(d.activities.filter((a) => a.date >= d.story.krank.from && a.date <= d.story.krank.to && a.type === 'Run')).toEqual([])

      expect(d.activities.filter((a) => a.type === 'Strength' || a.type === 'Ride').length).toBeGreaterThanOrEqual(3)
      expect(Object.keys((d.settings.week_feedback as { byWeek: object }).byWeek).length).toBeGreaterThanOrEqual(1)
      const fb = (d.settings.run_feedback as { byActivity: Record<string, unknown> }).byActivity
      expect(Object.keys(fb).length).toBeGreaterThanOrEqual(2)
      for (const id of Object.keys(fb)) expect(d.activities.some((a) => a.id === id)).toBe(true)
      expect(d.activities.some((a) => a.perceivedExertion != null)).toBe(true)

      // Runs up to yesterday only, every block run with streams and metrics.
      expect(d.activities.every((a) => a.date < today)).toBe(true)
      const blockRuns = d.activities.filter((a) => a.type === 'Run' && a.date >= d.block.planStart)
      expect(blockRuns.length).toBeGreaterThan(30)
      expect(new Set(d.streams.map((s) => s.activityId))).toEqual(new Set(blockRuns.map((a) => a.id)))
      for (const a of blockRuns) expect(JSON.parse(a.metricsJson!).splits.length).toBeGreaterThan(0)
    })
  }

  it('keine echten Personendaten: keine E-Mail, keine Clerk-ID, keine Namen außer dem Rennen', async () => {
    const d = await asDemo(() => generateDemo('2026-11-02'))
    const text = JSON.stringify(d)
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i)
    expect(text).not.toMatch(/user_[A-Za-z0-9]{10,}/)
    expect(text).not.toMatch(/livius|porto/i)
    expect(new Set(d.activities.map((a) => a.source))).toEqual(new Set(['file', 'manual']))
  })
})
