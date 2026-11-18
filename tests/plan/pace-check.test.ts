// An easy run is measured against the pace the plan shows for that day, not against the profile's example value.
import { afterEach, describe, expect, it } from 'vitest'
import { checkPace } from '@/lib/plan/pace-check'
import { registerLiveBlocks } from '@/lib/plan/blocks'
import { athlete } from '@/lib/athlete'
import { paceToS } from '@/lib/plan/format'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { PlanSession, TrainingBlock } from '@/lib/plan/types'

afterEach(() => registerLiveBlocks([]))

const hm: TrainingBlock = {
  ...PORTO_2026, handWritten: undefined, id: 'gen-hm-2027', goalId: 'hm-2027', planStart: '2027-05-03', end: '2027-08-01',
  race: { ...PORTO_2026.race, date: '2027-08-01', goalPaceS: 256 },
  paces: { easy: '5:21', threshold: '4:11', intervals_vo2: '3:54', race: '4:16' },
  weeks: [{ kw: 18, start: '2027-05-03', end: '2027-05-09', km: 44, focus: 'Grundlage' }], sessions: [],
}
const easy: PlanSession = { date: '2027-05-05', type: 'easy', title: 'Locker', km: 9 }
const run = (paceS: number) => ({ km: 9, paceS, avgHr: 140, splitPacesS: Array.from({ length: 9 }, () => paceS) })

describe('checkPace: the target of an easy day', () => {
  it('inside a block it is the block\'s easy pace: 5:25 on a 5:21 day is on target', () => {
    registerLiveBlocks([hm])
    const c = checkPace(easy, run(325))
    expect(c).toMatchObject({ kind: 'easy', targetS: 321, deltaS: 4, verdict: 'im Ziel' })
    expect(checkPace(easy, run(300)).verdict).toBe('zu schnell')
  })
  it('outside every block the profile\'s easy pace is left', () => {
    registerLiveBlocks([hm])
    expect(checkPace({ ...easy, date: '2028-06-01' }, null).targetS).toBe(paceToS(athlete().easyPace))
  })
  it('a session with its own pace keeps it', () => {
    registerLiveBlocks([hm])
    expect(checkPace({ ...easy, type: 'tempo', pace: '4:11' }, null).targetS).toBe(251)
  })
})
