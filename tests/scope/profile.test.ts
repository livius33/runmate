// AC-6 (Phase 2): zones, race caps, athlete facts and "today" derive from the runner's profile; a missing profile
// gives marked example defaults.
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, LTHR_ZONES_ENABLED, resolveProfile, validateProfile } from '@/lib/profile'
import { hrZones, raceHr, zonesFor } from '@/lib/analytics/hr'
import { athlete } from '@/lib/athlete'
import { createScope } from '@/lib/scope'
import { todayLocal } from '@/lib/dates'

describe('Profil → Zonen', () => {
  it('ohne Profil: die bisherigen Beispielwerte, alle als Standard markiert', () => {
    const p = resolveProfile(null)
    expect(p.hrMax).toBe(190)
    expect(p.hrRest).toBe(60)
    expect(p.timezone).toBe('Europe/Berlin')
    expect(p.defaults).toEqual(expect.arrayContaining(['hrMax', 'hrRest', 'timezone', 'weightKg', 'pbTime']))
    // The constants hr.ts had before Phase 2 (HFmax 190: 65/71/77.5/85 %).
    expect(hrZones(p).map((z) => [z.min, z.max])).toEqual([[0, 124], [124, 135], [135, 147], [147, 162], [162, 999]])
    expect(raceHr(42.195, p)).toEqual({ cap: 162, hard: 167 })
  })

  it('eigene HFmax verschiebt Zonen, Rennpuls und Athletendaten', () => {
    const p = resolveProfile({ hrMax: 200, hrRest: 65, weightKg: 65.5, pbTime: '3:12' })
    expect(p.defaults).not.toContain('hrMax')
    expect(p.defaults).toContain('vo2max')
    expect(hrZones(p)[1]).toMatchObject({ min: 130, max: 142 })
    expect(raceHr(42.195, p).cap).toBe(170)
    expect(raceHr(21.0975, p).cap).toBe(178)
    expect(athlete(p)).toMatchObject({ hrMax: 200, zone2: [130, 142], raceHrCap: 170, weightKg: 65.5, pb: { time: '3:12', hr: 168 } })
  })

  it('LTHR-Modell: Zonen als Anteile der LTHR (Friel), ohne LTHR zurück auf HFmax', () => {
    // The code path stays (hidden behind LTHR_ZONES_ENABLED until researched).
    expect(zonesFor({ hrMax: 195, hrRest: 60, lthr: 172, zoneModelUsed: 'lthr' }).map((z) => z.max)).toEqual([146, 155, 163, 172, 999])
    const noLt = resolveProfile({ hrMax: 195, zoneModel: 'lthr' })
    expect(noLt.zoneModelUsed).toBe('hrmax')
    expect(zonesFor(noLt)).toEqual(zonesFor(resolveProfile({ hrMax: 195 })))
  })

  it('LTHR-Modell gesperrt: gespeichertes "lthr" ergibt HFmax-Zonen', () => {
    expect(LTHR_ZONES_ENABLED).toBe(false)
    const lt = resolveProfile({ hrMax: 195, lthr: 172, zoneModel: 'lthr' })
    expect(lt.zoneModelUsed).toBe('hrmax')
    expect(zonesFor(lt)).toEqual(zonesFor(resolveProfile({ hrMax: 195 })))
  })

  it('"heute" in der Zeitzone des Profils', () => {
    const at = new Date('2026-11-01T23:30:00Z')
    expect(todayLocal(at, createScope('a', { timezone: 'Europe/Berlin' }).profile.timezone)).toBe('2026-11-02')
    expect(todayLocal(at, createScope('b', { timezone: 'America/New_York' }).profile.timezone)).toBe('2026-11-01')
    expect(resolveProfile({ timezone: 'Mars/Olympus' }).timezone).toBe(DEFAULT_PROFILE.timezone)
  })
})

describe('Profil-Formular', () => {
  it('leere Felder werden null (= Standard), gültige Werte gespeichert', () => {
    const r = validateProfile({ hrMax: '198', hrRest: '', lthr: null, pbTime: '3:05:30', easyPace: '5:15', timezone: 'Europe/Lisbon', zoneModel: '' })
    expect(r).toEqual({ ok: true, profile: expect.objectContaining({ hrMax: 198, hrRest: null, lthr: null, zoneModel: null, pbTime: '3:05:30', easyPace: '5:15', timezone: 'Europe/Lisbon' }) })
  })

  // hr_max, hr_rest, lthr and pb_hr are integer columns: a decimal made Postgres reject the save (500).
  it('Pulswerte werden ganze Zahlen, Gewicht und VO2max behalten eine Nachkommastelle', () => {
    const r = validateProfile({ hrMax: 185.5, hrRest: '50.4', lthr: 160.5, pbHr: 170.2, weightKg: 70.25, vo2max: 55.55 })
    expect(r).toEqual({ ok: true, profile: expect.objectContaining({ hrMax: 186, hrRest: 50, lthr: 161, pbHr: 170, weightKg: 70.3, vo2max: 55.6 }) })
  })

  it.each([
    [{ hrMax: 300 }, 'HFmax'],
    [{ hrMax: 130, hrRest: 100 }, 'Ruhepuls und HFmax'],
    [{ zoneModel: 'lthr' }, 'LTHR'],
    [{ zoneModel: 'lthr', lthr: 170 }, 'noch nicht verfügbar'],
    [{ hrMax: 180, lthr: 185 }, 'LTHR muss unter'],
    [{ easyPace: '5:75' }, 'Lockeres Tempo'],
    [{ timezone: 'Nowhere/City' }, 'Zeitzone'],
  ])('lehnt %j ab', (input, msg) => {
    const r = validateProfile(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain(msg)
  })
})
