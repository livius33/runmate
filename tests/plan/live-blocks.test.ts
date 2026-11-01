// Runtime block registry (07-14): live blocks next to Porto, same synchronous lookups; bad blocks are dropped.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { activeBlock, allSessions, blockFor, blocks, firstPlanStart, raceOf, registerLiveBlocks, weekOf } from '@/lib/plan/blocks'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { TrainingBlock } from '@/lib/plan/types'

const hm: TrainingBlock = {
  ...PORTO_2026, handWritten: undefined, paces: undefined, id: 'gen-hm-2027', goalId: 'hm-2027', planStart: '2026-11-30', end: '2027-02-28',
  race: { ...PORTO_2026.race, name: 'Halbmarathon', date: '2027-02-28', code: 'HM' },
  weeks: [{ kw: 49, start: '2026-11-30', end: '2026-12-06', km: 55, focus: 'Grundlage' }],
  sessions: [{ date: '2026-12-01', type: 'tempo', km: 10, title: 'Qualität', key: true }],
}
afterEach(() => registerLiveBlocks([]))

describe('Laufzeit-Register der Trainingsblöcke (AC-3)', () => {
  it('ohne Live-Block: nur Porto', () => {
    expect(blocks().map((b) => b.id)).toEqual(['porto-2026'])
  })
  it('Live-Block ab 30.11.: Lookups sehen ihn, davor Porto; der Plan beginnt weiter mit Porto', () => {
    registerLiveBlocks([hm])
    expect(blockFor('2026-11-29')?.id).toBe('porto-2026')
    expect(blockFor('2026-11-30')?.id).toBe('gen-hm-2027')
    expect(activeBlock('2026-12-05').id).toBe('gen-hm-2027')
    expect(raceOf('2026-12-05').code).toBe('HM')
    expect(weekOf('2026-12-01')?.kw).toBe(49)
    expect(allSessions().some((s) => s.date === '2026-12-01' && s.key)).toBe(true)
    expect(firstPlanStart()).toBe(PORTO_2026.planStart)
  })
  it('überlappende oder kaputte Live-Blöcke werden übersprungen, nie geworfen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerLiveBlocks([{ ...hm, planStart: '2026-11-23' }, { ...hm, id: 'x', weeks: undefined as never }])
    expect(blocks().map((b) => b.id)).toEqual(['porto-2026'])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })
  it('jede API-Route, die Plan, Insights oder Saison liest, lädt vorher die Live-Blöcke', () => {
    const files = execSync("grep -rl \"lib/plan/\\|lib/insights/\\|lib/season/\" app/api --include=route.ts", { encoding: 'utf8' }).trim().split('\n')
    const missing = files.filter((f) => !readFileSync(f, 'utf8').includes('await ensureLiveBlocks()'))
    expect(missing).toEqual([])
  })
})
