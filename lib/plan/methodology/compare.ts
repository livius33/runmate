// Template vs. measured plan: one row per parameter with tolerance. Used for the example template (examples/porto-2026) and for generated
// plans from 07-02 ("does the generated plan follow its template?"). Pure.
import type { Distance, Methodology } from './schema'
import type { PlanMeasure } from './describe'

export interface CompareRow { key: string; template: number; measured: number | null; diff: number | null; tolerance: number; ok: boolean }

const SHARE = 0.05   // shares ±0.05
const COUNT = 1      // counts ±1
const KM = 0.05      // km ±5 %

export function compareToTemplate(m: Methodology, d: PlanMeasure, distance: Distance): CompareRow[] {
  const rows: CompareRow[] = []
  const add = (key: string, template: number, measured: number | null | undefined, tolerance: number) => {
    const diff = measured == null ? null : Math.round((measured - template) * 1000) / 1000
    rows.push({ key, template, measured: measured ?? null, diff, tolerance, ok: diff != null && Math.abs(diff) <= tolerance + 1e-9 })
  }
  add('phases.split.base', m.phases.split.base, d.split.base, SHARE)
  add('phases.split.build', m.phases.split.build, d.split.build, SHARE)
  add('phases.split.peak', m.phases.split.peak, d.split.peak, SHARE)
  add('phases.taper.weeks', m.phases.taper.weeks[distance] ?? 0, d.taper.weeks, 0)
  m.phases.taper.volume.forEach((v, i) => add(`phases.taper.volume.${i}`, v, d.taper.volume[i], SHARE))
  add('volume.start', m.volume.start, d.startShare, SHARE)
  for (const p of ['base', 'build', 'peak'] as const) {
    add(`volume.phases.${p}.start`, m.volume.phases[p][0], d.phaseVolume[p][0], SHARE)
    add(`volume.phases.${p}.end`, m.volume.phases[p][1], d.phaseVolume[p][1], SHARE)
  }
  add('volume.ramp_max', m.volume.ramp_max, d.rampMax, SHARE)
  add('volume.recovery_week.every', m.volume.recovery_week.every, d.recovery.every, COUNT)
  add('volume.recovery_week.volume', m.volume.recovery_week.volume, d.recovery.volume, SHARE)
  for (const p of ['base', 'build', 'peak', 'taper'] as const) {
    add(`intensity.${p}.easy`, m.intensity[p].easy, d.intensity[p].easy, SHARE)
    add(`intensity.${p}.moderate`, m.intensity[p].moderate, d.intensity[p].moderate, SHARE)
    add(`intensity.${p}.hard`, m.intensity[p].hard, d.intensity[p].hard, SHARE)
    add(`week.key_sessions.${p}`, m.week.key_sessions[p], d.keySessions[p], COUNT)
  }
  add('week.runs', m.week.runs, d.runsPerWeek, COUNT)
  add('week.long_run.share', m.week.long_run.share, d.longRun.share, SHARE)
  add('week.long_run.max_km', m.week.long_run.max_km, d.longRun.maxKm, m.week.long_run.max_km * KM)
  return rows
}

// Keys a template explains in its body: <!-- explained: key1, key2 -->
export function explainedKeys(body: string): string[] {
  const m = body.match(/<!--\s*explained:\s*([^>]*?)\s*-->/)
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : []
}
