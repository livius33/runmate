// "Mein Ansatz" (07-05): own values merged into a template, checked like a template file.
import { describe, expect, it } from 'vitest'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { fieldValue, tuneFields, tuneTemplate } from '@/lib/plan/methodology/tune'
import { buildSkeleton } from '@/lib/plan/generator/skeleton'
import { rulesFromTemplate } from '@/lib/plan/rules'

const pfitz = listMethodologies().valid.find((m) => m.id === 'pfitzinger-half')!.params

describe('Mein Ansatz', () => {
  it('übernimmt eigene Werte, der Rest bleibt wie in der Vorlage', () => {
    const r = tuneTemplate(pfitz, { 'week.runs': 5, 'volume.recovery_week.every': 3, 'week.long_run.race_pace': false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([r.template.week.runs, r.template.volume.recovery_week.every, r.template.week.long_run.race_pace]).toEqual([5, 3, false])
    expect(r.template.week.key_sessions).toEqual(pfitz.week.key_sessions)
    expect(pfitz.week.runs).toBe(6)   // the template itself is untouched
  })
  it('meldet unbekannte Felder, Bereiche und ganze Zahlen auf Deutsch', () => {
    const r = tuneTemplate(pfitz, { 'week.runs': 4.5, 'volume.ramp_max': 0.3, 'paces.offsets.easy': 10 })
    expect(r.ok ? [] : r.errors).toEqual(['Läufe pro Woche: 2–14, ganze Zahl', 'Steigerung pro Woche höchstens: 3 %–15 %', 'paces.offsets.easy: nicht einstellbar'])
  })
  it('Taper-Wochen je Distanz der Vorlage; der Generator rechnet mit dem eigenen Wert', () => {
    expect(tuneFields(pfitz).filter((f) => f.group === 'Taper').map((f) => f.path)).toEqual(['phases.taper.weeks.half'])
    const r = tuneTemplate(pfitz, { 'phases.taper.weeks.half': 3 })
    if (!r.ok) throw new Error(r.errors.join())
    const sk = buildSkeleton({ template: r.template, distance: 'half', raceDate: '2027-02-28', start: '2026-11-30', currentKm: 50, provenKm: 95 })
    expect(sk.ok && sk.phases.taper).toBe(3)
  })
  it('jedes Feld liest einen Wert aus jeder Vorlage (oder den Standardwert, 07-18)', () => {
    for (const m of listMethodologies().valid) for (const f of tuneFields(m.params)) expect({ id: m.id, path: f.path, v: fieldValue(m.params, f.path) !== undefined }).toEqual({ id: m.id, path: f.path, v: true })
  })
  it('Anpassung: eigene Werte landen in den Regeln des Plans (07-07)', () => {
    const r = tuneTemplate(pfitz, { 'adaptation.missed_km.strategy': 'redistribute', 'adaptation.thresholds.tsb_fatigue': -20, 'adaptation.missed_key.max_shift_days': 7 })
    if (!r.ok) throw new Error(r.errors.join())
    expect(rulesFromTemplate(r.template)).toMatchObject({ rebalance: true, tsbRed: -20, maxShiftDays: 7 })
  })
  it('Anpassung: nur erlaubte Auswahl, Sicherheitsgrenzen', () => {
    const r = tuneTemplate(pfitz, { 'adaptation.missed_km.strategy': 'irgendwas', 'adaptation.thresholds.tsb_fatigue': -45, 'adaptation.thresholds.acwr_caution': 1.8 })
    expect(r.ok ? [] : r.errors).toEqual([
      'Fehlende km der Woche: verteilen oder weglassen', 'Sehr müde ab TSB: −40 bis −10', 'Belastung zu hoch ab ACWR: 1,1–1,5',
    ])
  })
})
