// Generator step 1 (07-02): week skeleton from a methodology template. Porto reproduction, peak cases, load cycles,
// template fields and safety limits. Rules: methodologies/research/{peak-and-recovery,load-cycles,phases-and-taper}.md.
import { describe, expect, it } from 'vitest'
import { PLAN_START, RACE, SESSIONS } from '@/examples/porto-2026/plan'
import { listMethodologies, parseMethodology } from '@/lib/plan/methodology/load'
import { describePlan, type PlanLike } from '@/lib/plan/methodology/describe'
import { compareToTemplate } from '@/lib/plan/methodology/compare'
import { checkSafety, SAFETY } from '@/lib/plan/methodology/safety'
import { buildSkeleton, skeletonToSessions, type Skeleton, type SkeletonInput } from '@/lib/plan/generator/skeleton'
import { readFileSync } from 'node:fs'
import { checkSkeleton } from './skeleton-check'
import { portoTemplate } from '@/examples/porto-2026/template'

const template = (id: string) => listMethodologies().valid.find((m) => m.id === id)!.params
const build = (input: SkeletonInput): Skeleton => {
  const r = buildSkeleton(input)
  if (!r.ok) throw new Error(r.error)
  expect(checkSkeleton(r, input)).toEqual([])
  return r
}
const porto = (extra: Partial<SkeletonInput> = {}): SkeletonInput => ({
  template: portoTemplate().params, distance: 'marathon', raceDate: '2026-11-08', start: '2026-06-22',
  currentKm: 64, provenKm: 64, ...extra,
})
const recoveryWeeks = (sk: Skeleton) => sk.weeks.map((w, i) => (w.kind === 'recovery' ? i + 1 : 0)).filter(Boolean)

describe('Porto 2026 nachgebaut (AC-1)', () => {
  const input = porto({ peakKm: 126 })
  const sk = build(input)

  it('20 Wochen: 5 Grundlage, 8 Aufbau, 4 Spitze, 3 Taper; Spitzenwoche 126 km; Empfehlung 86,5 km mit Warnung', () => {
    expect(sk.weeks).toHaveLength(20)
    expect(sk.phases).toEqual({ base: 5, build: 8, peak: 4, taper: 3 })
    expect(Math.max(...sk.weeks.map((w) => w.km))).toBe(126)
    expect(sk.peak).toMatchObject({ recommendedKm: 86.5, binding: 'history' })
    expect(sk.warnings).toContain('Spitze 126 km liegt über der Empfehlung 86,5 km')
  })

  it('passt zur Vorlage: Phasen, Startanteil, Steigerung, Erholungswochen, Taper (Umfangskurve je Phase nur gemeldet)', () => {
    const measured = describePlan(skeletonToSessions(sk), { raceDate: input.raceDate, racePaceS: RACE.goalPaceS })
    const rows = compareToTemplate(input.template, measured, 'marathon')
      .filter((r) => r.key.startsWith('phases.') || ['volume.start', 'volume.ramp_max', 'volume.recovery_week.every', 'volume.recovery_week.volume'].includes(r.key))
    expect(rows.filter((r) => !r.ok)).toEqual([])
    // The real curve peaks mid-build (126 km in week 11), so the template tops out at 0,90; a linear climb cannot match it.
    const shape = compareToTemplate(input.template, measured, 'marathon').filter((r) => r.key.startsWith('volume.phases.') && !r.ok)
    console.info('Porto volume.phases.* (gemeldet):', shape.map((r) => `${r.key} ${r.template} → ${r.measured}`).join(', ') || 'alle ok')
  })

  // (Removed in the open-source extraction: a week-by-week check against the private plan history before PLAN_START.)

  it('ohne feste Spitze (P = B): 86,5 km, Erholung in Woche 4, 8, 12, 15; Wochen 16–17 belasten vor dem Taper', () => {
    const free = build(porto())
    expect(free.peakKm).toBe(86.5)
    expect(free.peak.binding).toBe('history')
    expect(recoveryWeeks(free)).toEqual([4, 8, 12, 15])
    expect(free.weeks.slice(15, 17).map((w) => w.kind)).toEqual(['load', 'load'])
    expect(free.weeks[0].km).toBe(64)
  })
})

describe('Spitze erklärt (AC-5)', () => {
  const half = (extra: Partial<SkeletonInput>): SkeletonInput => ({
    template: template('pfitzinger-half'), distance: 'half', raceDate: '2027-02-21', start: '2026-11-30', currentKm: 50, ...extra,
  })

  it('Zeit begrenzt: HM-Beispiel B 50, P 101 → 85,5 km (7 Wochen bis zur Spitzenphase, 8 % pro Woche)', () => {
    const sk = build(half({ provenKm: 101, currentKmSource: 'recoveryBlock' }))
    expect(sk.peak).toMatchObject({ recommendedKm: 85.5, binding: 'time' })
    expect(sk.peakKm).toBe(85.5)
    expect(sk.peak.why.join(' ')).toContain('Bis zur Spitzenphase bleiben 7 Wochen')
    expect(sk.peak.why.join(' ')).toContain('letzte Woche deines Erholungsblocks')
  })
  it('Verlauf begrenzt: ohne gehaltenen Umfang (P = B) → 50 × 1,35 = 67,5 km', () => {
    const sk = build(half({}))
    expect(sk.peak).toMatchObject({ recommendedKm: 67.5, binding: 'history' })
    expect(sk.peak.why.join(' ')).toContain('Neu dazukommen dürfen höchstens 35 % (67,5 km)')
  })
  it('Doppeltes begrenzt: lange Vorbereitung, P weit über 2 × B → 2 × B', () => {
    const sk = build(half({ currentKm: 30, provenKm: 120, start: '2026-08-03' }))
    expect(sk.peak).toMatchObject({ recommendedKm: 60, binding: 'absolute' })
    expect(sk.peak.why.join(' ')).toContain('Mehr als das Doppelte deines aktuellen Umfangs plant Runmate nie')
  })
  it('Vorlage begrenzt: volume.peak.max_km', () => {
    const t = template('pfitzinger-half')
    const sk = build(half({ template: { ...t, volume: { ...t.volume, peak: { ...t.volume.peak, max_km: 60 } } } }))
    expect(sk.peak).toMatchObject({ recommendedKm: 60, binding: 'template' })
  })
  it('nie unter dem aktuellen Umfang: max_km unter B → B', () => {
    const t = template('pfitzinger-half')
    const sk = build(half({ template: { ...t, volume: { ...t.volume, peak: { ...t.volume.peak, max_km: 40 } } } }))
    expect(sk.peak).toMatchObject({ recommendedKm: 50, binding: 'current' })
  })
  it('Einsteiger: höchstens 25 % neu', () => {
    const sk = build(half({ experience: 'novice' }))
    expect(sk.peak).toMatchObject({ recommendedKm: 62.5, binding: 'history' })
    expect(sk.peak.why.join(' ')).toContain('Einsteiger')
  })
  it('Warnung unter dem Mindestumfang der Distanz (Halbmarathon 35 km)', () => {
    const sk = build(half({ currentKm: 22 }))
    expect(sk.peakKm).toBeLessThan(35)
    expect(sk.warnings.join(' ')).toContain('Für einen Halbmarathon ist das wenig')
  })
  it('feste Spitze wird auf das Erreichbare begrenzt (2 × B, 10 % pro Woche) und gemeldet', () => {
    const sk = build(half({ peakKm: 130 }))
    expect(sk.peakKm).toBe(97.5)                             // 50 × 1,1⁷ = 97,4 < 2 × 50
    expect(sk.warnings.join(' ')).toContain('Spitze 130 km auf 97,5 km begrenzt')
  })
})

describe('Belastungszyklen (load-cycles.md)', () => {
  it('every 8 (alte Hansons-Einstellung): höchstens 5 Belastungswochen am Stück, eingefügte Erholungswoche wird gemeldet', () => {
    const t = template('hansons-marathon')
    const old = { ...t, volume: { ...t.volume, recovery_week: { ...t.volume.recovery_week, every: 8 } } }
    const sk = build({ template: old, distance: 'marathon', raceDate: '2027-04-25', start: '2026-11-30', currentKm: 70 })
    expect(Math.max(...sk.runs.map((r) => r.weeks))).toBeLessThanOrEqual(SAFETY.maxLoadWeeksInRow)
    expect(sk.warnings.join(' ')).toContain('höchstens 5 Belastungswochen am Stück')
  })
  it('Hansons (every 6, 07-04): bleibt in der Grenze, keine eingefügte Erholungswoche', () => {
    const sk = build({ template: template('hansons-marathon'), distance: 'marathon', raceDate: '2027-04-25', start: '2026-11-30', currentKm: 70 })
    expect(template('hansons-marathon').volume.recovery_week.every).toBe(6)
    expect(sk.warnings.join(' ')).not.toContain('eingefügt')
  })
  it('Testrennen zählt als Erholungswoche und startet die Zählung neu', () => {
    const base = porto()
    const sk = build({ ...base, tuneUps: ['2026-08-02'] })   // Sunday of week 6
    expect(sk.weeks[5].kind).toBe('tuneup')
    expect(recoveryWeeks(sk)[0]).toBe(4)
    expect(recoveryWeeks(sk)).not.toContain(8)              // count restarts after week 6 → next recovery week 10
    expect(recoveryWeeks(sk)).toContain(10)
  })
  it('Ab 50 Jahren: Erholungswoche jede dritte Woche', () => {
    const sk = build(porto({ age: 52 }))
    expect(recoveryWeeks(sk).slice(0, 3)).toEqual([3, 6, 9])
  })
  it('meldet jede Belastungsphase mit Länge und ob sie steigt', () => {
    const sk = build(porto())
    expect(sk.runs[0]).toMatchObject({ from: '2026-06-22', weeks: 3 })
  })
})

describe('Fehler', () => {
  it('zu kurz: weniger als Taper + 3 Wochen', () => {
    const r = buildSkeleton(porto({ start: '2026-10-05' }))
    expect(r).toEqual({ ok: false, error: 'Mindestens 6 Wochen bis zum Rennen (jetzt 5).' })
  })
  it('Distanz nicht in der Vorlage', () => {
    const r = buildSkeleton(porto({ distance: 'half' }))
    expect(r).toEqual({ ok: false, error: 'Die Vorlage „Runmate / Porto 2026“ hat keinen Plan für einen Halbmarathon.' })
  })
  it('kurzer Aufbau: Warnung unter 12 Wochen Marathon', () => {
    const r = buildSkeleton(porto({ start: '2026-09-14' }))
    expect(r.ok && r.warnings.join(' ')).toContain('Kurzer Aufbau')
  })
})

describe('Vorlagen und Sicherheitsgrenzen (AC-6)', () => {
  it('alle Vorlagen laden unverändert, neue Felder haben Vorgaben', () => {
    const { valid, invalid } = listMethodologies()
    expect(invalid).toEqual([])
    expect(valid).toHaveLength(8)   // the Porto template lives in examples/porto-2026
    const t = portoTemplate().params
    expect(t.volume.peak).toEqual({ over_base: 1.35, over_proven: 1, floor: { marathon: 50, half: 35, '10k': 30 } })
    expect([t.volume.growth, t.volume.growth_return]).toEqual([0.05, 0.08])
    expect(t.phases.min_weeks.marathon).toEqual({ base: 2, build: 3, peak: 3 })
    expect(t.phases.shorten_order).toEqual(['build', 'base', 'peak'])
  })
  it('meldet Wachstum, Spitze, Rennwoche und Taper-Schnitt über den Sicherheitsgrenzen', () => {
    const raw = { volume: { growth: 0.12, growth_return: 0.11, peak: { over_base: 2.2 } }, phases: { taper: { volume: [0.95, 0.92, 0.7] } } }
    expect(checkSafety(raw).map((s) => s.path)).toEqual(expect.arrayContaining([
      'volume.growth', 'volume.growth_return', 'volume.peak.over_base', 'phases.taper.volume.last', 'phases.taper.volume.mean',
    ]))
  })
  it('Porto-Vorlage parst weiterhin (gleiche Werte wie 07-01)', () => {
    const r = parseMethodology(readFileSync('examples/porto-2026/runmate-porto-2026.md', 'utf8'), 'runmate-porto-2026.md')
    expect(r.ok && r.value.params.volume.ramp_max).toBe(0.12)
  })
  it('andere Vorlagen: erste und letzte Belastungswoche jeder Phase folgen den Vorlagen-Anteilen (±0,05)', () => {
    const off: string[] = []
    for (const m of listMethodologies().valid.filter((x) => x.id !== 'runmate-porto-2026')) {
      const t = m.params
      const distance = t.distances[0]
      const peakKm = 80
      const input: SkeletonInput = { template: t, distance, raceDate: '2027-06-27', start: '2026-11-30', currentKm: peakKm * t.volume.start, peakKm }
      const sk = build(input)
      for (const p of ['base', 'build', 'peak'] as const) {
        const load = sk.weeks.filter((w) => w.phase === p && w.kind === 'load')
        if (load.length < 2) continue
        const [a, b] = t.volume.phases[p]
        const first = load[0].km / sk.peakKm
        const last = load[load.length - 1].km / sk.peakKm
        if (Math.abs(first - a) > 0.05 || Math.abs(last - b) > 0.05) off.push(`${m.id} ${p}: ${a}–${b} → ${first.toFixed(2)}–${last.toFixed(2)}`)
      }
    }
    expect(off).toEqual([])
  })
})
