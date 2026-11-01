// Methodology templates (07-01): schema, safety limits, loader, describePlan, Porto template vs. the Porto plan.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PLAN_START, RACE, SESSIONS } from '@/examples/porto-2026/plan'
import { listMethodologies, parseMethodology } from '@/lib/plan/methodology/load'
import { describePlan, qualityParts, type PlanLike } from '@/lib/plan/methodology/describe'
import { compareToTemplate, explainedKeys } from '@/lib/plan/methodology/compare'
import { portoTemplate } from '@/examples/porto-2026/template'

const porto = () => portoTemplate()

describe('Methodik-Vorlagen', () => {
  it('alle Vorlagen in methodologies/ sind gültig', () => {
    const { valid, invalid } = listMethodologies()
    expect(invalid).toEqual([])
    expect(portoTemplate().id).toBe('runmate-porto-2026')   // the example template (examples/porto-2026) stays valid too
  })

  it('die kaputte Testdatei meldet jeden Fehler auf Deutsch, Format und Sicherheit zusammen', () => {
    const r = parseMethodology(readFileSync('scripts/fixtures/methodology-broken.md', 'utf8'))
    expect(r.ok).toBe(false)
    const errors = r.ok ? [] : r.errors
    expect(errors).toEqual(expect.arrayContaining([
      'phases.split: Summe 0,95 – muss 1 sein',
      'week: unbekanntes Feld „long_run_maxkm“ (Tippfehler?)',
      expect.stringMatching(/^workouts\.base\.0\.kind: „fartlek“ ist nicht erlaubt/),
      'volume.ramp_max: 25 % über der Sicherheitsgrenze 15 %',
    ]))
    expect(errors).toHaveLength(4)
  })

  it('jede Sicherheitsgrenze greift', () => {
    const text = readFileSync('examples/porto-2026/runmate-porto-2026.md', 'utf8')
    const cases: [RegExp, string, string][] = [
      [/acwr_caution: 1\.5/, 'acwr_caution: 1.8', 'adaptation.thresholds.acwr_caution: 1,8 über der Sicherheitsgrenze 1,5'],
      [/max_km: 41/, 'max_km: 45', 'week.long_run.max_km: 45 über der Sicherheitsgrenze 42'],
      [/share: 0\.33/, 'share: 0.45', 'week.long_run.share: 45 % über der Sicherheitsgrenze 40 %'],
      [/cap_km: 5/, 'cap_km: 9', 'adaptation.missed_km.cap_km: 9 über der Sicherheitsgrenze 8'],
      [/tsb_fatigue: -25/, 'tsb_fatigue: -50', 'adaptation.thresholds.tsb_fatigue: -50 unter der Sicherheitsgrenze -40'],
      [/volume: \[0\.70, 0\.56, 0\.24\]/, 'volume: [1.1, 0.56, 0.24]', 'phases.taper.volume.0: 110 % über der Sicherheitsgrenze 100 %'],
    ]
    for (const [find, replace, message] of cases) {
      const r = parseMethodology(text.replace(find, replace))
      expect({ replace, errors: r.ok ? [] : r.errors }).toEqual({ replace, errors: [message] })
    }
  })

  it('id muss zum Dateinamen passen', () => {
    const r = parseMethodology(readFileSync('examples/porto-2026/runmate-porto-2026.md', 'utf8'), 'anders.md')
    expect(r.ok ? [] : r.errors).toEqual(['id: „runmate-porto-2026“ passt nicht zum Dateinamen „anders“'])
  })
})

describe('describePlan', () => {
  it('liest Qualitätsblöcke aus den Notizen (Wiederholungen, Dezimal-km, Tempobereiche)', () => {
    expect(qualityParts('3 ein → 3 × 4 km @ 4:23 (1 km Trabpause) → 2 aus')).toEqual([{ km: 12, paceS: 263 }])
    expect(qualityParts('3km WU + 5×1.5km @4:00–4:03/km (HM-Pace), 90s Pause')).toEqual([{ km: 7.5, paceS: 242 }])
    expect(qualityParts('3km WU + 9km Threshold @4:10–4:18/km + 2km CD')).toEqual([{ km: 9, paceS: 254 }])
    expect(qualityParts('26km easy → letzte 12km @4:14–4:18/km MP')).toEqual([{ km: 12, paceS: 256 }])
    expect(qualityParts('Zone 2')).toEqual([])
  })

  // (Removed in the open-source extraction: template vs. the private plan history before PLAN_START.)
})
