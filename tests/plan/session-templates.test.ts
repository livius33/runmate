// Session editor (07-08 AC-2): every kind yields a session whose workout text parses and matches its km; safety limits only.
import { afterEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { EDIT_KINDS, editError, editQualityKm, editSession, type EditKind } from '@/lib/plan/session-templates'
import { blockPaces, registerLiveBlocks } from '@/lib/plan/blocks'
import { effectiveSessions } from '@/lib/plan/effective'
import { parseStructure, totalKm, fitSession } from '@/lib/plan/structure'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { TrainingBlock } from '@/lib/plan/types'

const RUNS = Number(process.env.FC_RUNS ?? 200)
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
const QUALITY: EditKind[] = ['threshold', 'intervals', 'race_pace', 'long_rp']
const plan = effectiveSessions({})
afterEach(() => registerLiveBlocks([]))

describe('Einheiten-Editor (AC-2)', () => {
  it('Porto-Tempi aus dem Plan: Schwelle 4:15, Renntempo 4:23, locker 5:45', () => {
    expect(blockPaces('2026-10-28')).toMatchObject({ threshold: '4:15', race: '4:23', easy: '5:45' })
  })

  it('jede Qualitätsart: Text lässt sich lesen und passt genau zu den km', () => {
    fc.assert(fc.property(fc.constantFrom(...QUALITY), fc.integer({ min: 0, max: 46 }), (kind, n) => {
      const min = EDIT_KINDS.find((k) => k.kind === kind)!.minKm
      const km = min + n / 2
      if (km > 42) return true
      const s = editSession(kind, km, '2026-10-28')
      const st = parseStructure(s.notes)
      expect(st, `${kind} ${km}: ${s.notes}`).not.toBeNull()
      expect(Math.abs(totalKm(st!) - km)).toBeLessThan(0.05)
      expect(st!.warmKm).toBeGreaterThanOrEqual(1)
      expect(st!.coolKm).toBeGreaterThanOrEqual(1)
      expect(fitSession(s).notes).toBe(s.notes)
      return true
    }), { numRuns: RUNS, seed })
  })

  it('Schwelle 12 km: 2 × 3 km @ 4:15, Schlüsseleinheit', () => {
    const s = editSession('threshold', 12, '2026-10-28')
    expect(s).toMatchObject({ type: 'tempo', key: true, pace: '4:15' })
    expect(s.notes).toMatch(/^3 ein → 2 × 3 km @ 4:15 \(1 km Trab\) → 2 aus/)
  })

  it('eigenes Tempo wird übernommen', () => {
    expect(editSession('race_pace', 10, '2026-10-28', '4:20').notes).toContain('@ 4:20')
  })

  it('Rennen, feste Termine und Sicherheitsgrenzen werden abgelehnt', () => {
    expect(editError('easy', 10, '2026-11-08', plan)).toMatch(/Rennen/)
    expect(editError('easy', 10, '2026-10-25', plan)).toMatch(/feste Termine/)
    expect(editError('long', 45, '2026-10-31', plan)).toMatch(/42 km/)
    expect(editError('threshold', 5, '2026-10-29', plan)).toMatch(/mindestens 7 km/)
    expect(editError('easy', 0, '2026-10-29', plan)).toMatch(/km angeben/)
    expect(editError('race_pace', 10, '2026-10-29', plan, '423')).toMatch(/m:ss/)
    // Taper week 2.–8.11.: a 30-km race-pace session is far more than 25 % of the week.
    expect(editError('race_pace', 30, '2026-11-04', plan)).toMatch(/schnelle Teil/)
    expect(editError('rest', 0, '2026-10-29', plan)).toBeNull()
    expect(editError('threshold', 12, '2026-10-29', plan)).toBeNull()
  })

  it('Qualitäts-km je Art', () => {
    expect(editQualityKm(editSession('easy', 10, '2026-10-28'))).toBe(0)
    expect(editQualityKm(editSession('threshold', 12, '2026-10-28'))).toBe(6)
  })

  it('generierter Block: eingefrorene Tempi, ohne Tempi Abstände zum Renntempo', () => {
    const hm: TrainingBlock = {
      ...PORTO_2026, handWritten: undefined, paces: undefined, id: 'gen-hm-2027', goalId: 'hm-2027', planStart: '2026-11-30', end: '2027-02-28',
      race: { ...PORTO_2026.race, date: '2027-02-28', goalPaceS: 242 },
      weeks: [{ kw: 49, start: '2026-11-30', end: '2026-12-06', km: 55, focus: 'Grundlage' }], sessions: [],
    }
    registerLiveBlocks([{ ...hm, paces: { easy: '5:20', threshold: '4:05', intervals_vo2: '3:45', race: '4:02' } }])
    expect(blockPaces('2026-12-01')).toEqual({ easy: '5:20', threshold: '4:05', intervals_vo2: '3:45', race: '4:02' })
    registerLiveBlocks([hm])
    expect(blockPaces('2026-12-01')).toEqual({ easy: '5:22', threshold: '3:54', intervals_vo2: '3:37', race: '4:02' })
  })
})
