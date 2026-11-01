// AC-7 (Phase 2): two runners served by the same process, their requests interleaved at every await, never see each
// other's zones, blocks, athlete facts or "today". Runs the real path: runAsUser → ensureLiveBlocks (settings read
// through the fake database, answered per user id) → synchronous lookups in blocks.ts / hr.ts / dates.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runAsUser } from '@/lib/server/scope'
import { ensureLiveBlocks, LIVE_BLOCKS_KEY } from '@/lib/plan/live-blocks'
import { activeBlock, blocks, registerBuiltInBlocks, registerLiveBlocks } from '@/lib/plan/blocks'
import { hrMax, hrZones, raceHr } from '@/lib/analytics/hr'
import { athlete } from '@/lib/athlete'
import { todayLocal } from '@/lib/dates'
import { currentScope } from '@/lib/scope'
import { rulesFor } from '@/lib/plan/rules'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { TrainingBlock } from '@/lib/plan/types'
import { useFakeDb } from './fake-db'

const blockA: TrainingBlock = { ...PORTO_2026, id: 'block-a', handWritten: false, engine: { ...(PORTO_2026.engine ?? {}), tsbRed: -20 } as TrainingBlock['engine'] }
const blockB: TrainingBlock = { ...PORTO_2026, id: 'block-b', handWritten: false, race: { ...PORTO_2026.race, name: 'B-Marathon' }, engine: { ...(PORTO_2026.engine ?? {}), tsbRed: -35 } as TrainingBlock['engine'] }
const USERS = {
  'user-a': { profile: { hrMax: 200, hrRest: 65, weightKg: 60, timezone: 'Pacific/Kiritimati' }, block: blockA, z2max: 142, cap: 170, tsbRed: -20 },
  'user-b': { profile: { hrMax: 170, hrRest: 50, weightKg: 80, timezone: 'Pacific/Pago_Pago' }, block: blockB, z2max: 121, cap: 145, tsbRed: -35 },
} as const
type Id = keyof typeof USERS

const sleep = () => new Promise((r) => setTimeout(r, Math.random() * 4))
let fake: ReturnType<typeof useFakeDb>

beforeAll(() => {
  registerBuiltInBlocks([])                // only live blocks: the Porto block is user A's and user B's own copy here
  fake = useFakeDb((q) => {
    const user = q.params[0] as Id
    if (/from "settings"/.test(q.sql) && USERS[user]) {
      return [[LIVE_BLOCKS_KEY, JSON.stringify({ v: 1, blocks: [{ block: USERS[user].block, draftId: 'd', liveAt: '2026-01-01T00:00:00Z' }] })]]
    }
    return []
  })
})
afterAll(() => { fake.restore(); registerBuiltInBlocks([PORTO_2026]) })
afterEach(() => { delete process.env.NEXT_RUNTIME })

// One "request": load the blocks, then read everything a page would, with awaits in between.
async function request(id: Id) {
  return runAsUser(id, async () => {
    const seen: Record<string, unknown>[] = []
    const look = () => seen.push({
      user: currentScope().userId,
      hrMax: hrMax(), z2max: hrZones()[1].max, cap: raceHr(42.195).cap, weight: athlete().weightKg,
      goalBlocks: blocks().filter((b) => !b.base).map((b) => b.id), race: activeBlock('2026-10-01').race.name,
      tsbRed: rulesFor('2026-10-01').tsbRed,
      today: todayLocal(new Date('2026-11-01T11:00:00Z')),
    })
    await sleep(); await ensureLiveBlocks(); look()
    await sleep(); look()
    await Promise.all([sleep().then(look), sleep().then(look)])
    return seen
  }, { profile: USERS[id].profile })
}

describe('Zwei Nutzer in einem Prozess', () => {
  it('verschränkte Anfragen sehen nur die eigenen Zonen, Blöcke, Regeln und das eigene Datum', async () => {
    const order: Id[] = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 'user-b' : i % 2 ? 'user-a' : 'user-b'))
    const results = await Promise.all(order.map((id) => request(id).then((seen) => ({ id, seen }))))
    for (const { id, seen } of results) {
      const u = USERS[id]
      expect(seen).toHaveLength(4)
      for (const s of seen) {
        expect(s).toEqual({
          user: id, hrMax: u.profile.hrMax, z2max: u.z2max, cap: u.cap, weight: u.profile.weightKg,
          goalBlocks: [u.block.id], race: u.block.race.name, tsbRed: u.tsbRed,
          // Kiritimati is UTC+14 (already 2 November), Pago Pago UTC−11 (still 1 November)
          today: id === 'user-a' ? '2026-11-02' : '2026-11-01',
        })
      }
    }
  })

  it('außerhalb jeder Anfrage bleibt der Prozess-Scope unberührt', async () => {
    await Promise.all([request('user-a'), request('user-b')])
    expect(currentScope().userId).toBeNull()
    expect(blocks()).toEqual([])
    expect(hrMax()).toBe(190)
  })

  it('auf dem Next-Server darf ohne Nutzer-Scope kein Nutzerzustand geschrieben werden', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    expect(() => registerLiveBlocks([blockA])).toThrow(/outside a user scope/)
    await runAsUser('user-a', async () => { registerLiveBlocks([blockA]); expect(blocks().map((b) => b.id)).toEqual(['block-a']) }, { profile: null })
    expect(blocks()).toEqual([])
  })
})
