// Nights from the Garmin login: parsing, which nights a sync fetches, the request budget and failure isolation. No
// network: Garmin responses are fixtures (tests/sources/garmin-fake.ts), the fetch and the store are fakes.
import { describe, expect, it } from 'vitest'
import { fetchGarminNight, heartRateUrl, parseSleepData, sleepUrl } from '@/lib/sources/garmin-login/wellness'
import { EMPTY_RETRY_DAYS, MAX_WELLNESS_REQUESTS, nightsToFetch, syncWellness, wellnessStep, type WellnessDeps } from '@/lib/wellness/sync'
import { isMissingTable, type StoredNight } from '@/lib/wellness/store'
import { SourceError, type WellnessNight } from '@/lib/sources/types'
import { emptyNightResponse, emptyNightWithDayRhr, heartRateDay, sleepNight } from '../sources/garmin-fake'

const TODAY = '2026-05-20'
const NOW_S = Math.floor(Date.parse('2026-05-20T08:00:00Z') / 1000)
const DAY_S = 86400
const day = (n: number) => new Date(Date.parse(`${TODAY}T12:00:00Z`) + n * DAY_S * 1000).toISOString().slice(0, 10)
const dayOf = (d: Date) => d.toISOString().slice(0, 10)       // UTC is enough for these instants

const stored = (date: string, o: Partial<StoredNight> = {}): StoredNight => ({
  date, sleepS: 26000, deepS: 5000, remS: 6000, sleepScore: 80, hrvAvg: 60, hrvStatus: 'BALANCED', rhr: 50, rhrSource: 'night',
  fetchedAt: Math.floor(Date.parse(`${date}T20:00:00Z`) / 1000), ...o,
})
const empty = (date: string, fetchedAtS: number): StoredNight =>
  ({ date, sleepS: null, deepS: null, remS: null, sleepScore: null, hrvAvg: null, hrvStatus: null, rhr: null, rhrSource: null, fetchedAt: fetchedAtS })

const rateLimited = () => new SourceError('rate-limited', 'Garmin bremst.')
const unavailable = () => new SourceError('unavailable', 'Garmin nicht erreichbar.')

// A Garmin `get` over fixtures, recording the requests.
function fakeGet(byDate: Record<string, unknown> = {}, opts: { failSleep?: (d: string) => unknown; rhr?: number | null } = {}) {
  const calls: string[] = []
  const get = async (url: string) => {
    const date = /date=(\S+)$/.exec(url)![1]
    if (url === sleepUrl(date)) {
      calls.push(`sleep:${date}`)
      const err = opts.failSleep?.(date)
      if (err) throw err
      return byDate[date] ?? emptyNightResponse
    }
    if (url === heartRateUrl(date)) { calls.push(`hr:${date}`); return heartRateDay(opts.rhr ?? null) }
    throw new Error(`unexpected ${url}`)
  }
  return { get, calls, fetchNight: (date: string, left: number) => fetchGarminNight(get, date, left) }
}

function deps(o: Partial<WellnessDeps> & { rows?: StoredNight[] } = {}) {
  const saved: WellnessNight[][] = []
  const d: WellnessDeps = {
    today: TODAY, nowS: NOW_S, dayOf,
    fetchNight: fakeGet().fetchNight,
    load: async () => o.rows ?? [],
    save: async (n) => { saved.push(n) },
    ...o,
  }
  return { d, saved }
}

describe('dailySleepData parsen', () => {
  it('liest Schlaf, Tief-/REM-Schlaf, Score, HRV, Status und Ruhepuls der Nacht', () => {
    expect(parseSleepData(sleepNight({ status: 'unbalanced' }), TODAY)).toEqual({
      date: TODAY, sleepS: 24000, deepS: 5400, remS: 6000, sleepScore: 78, hrvAvg: 58, hrvStatus: 'UNBALANCED', rhr: 52, rhrSource: 'night',
    })
  })

  it('leere Nacht (Uhr nicht getragen) → alle Werte null; Ruhepuls ohne Nacht ist ein Tageswert', () => {
    expect(parseSleepData(emptyNightResponse, TODAY)).toMatchObject({ sleepS: null, hrvAvg: null, hrvStatus: null, rhr: null, rhrSource: null })
    expect(parseSleepData(emptyNightWithDayRhr, TODAY)).toMatchObject({ sleepS: null, rhr: 75, rhrSource: 'day' })
  })

  it('kaputte Antworten werfen nicht', () => {
    for (const raw of [null, undefined, 'x', 42, {}, { dailySleepDTO: null }, { dailySleepDTO: { sleepTimeSeconds: 'viel' }, avgOvernightHrv: NaN }])
      expect(parseSleepData(raw, TODAY).sleepS).toBeNull()
  })

  it('Ruhepuls fehlt in der Nacht → Tages-Herzfrequenz als Tageswert (markiert), nur wenn eine Anfrage übrig ist', async () => {
    const { calls, fetchNight } = fakeGet({ [TODAY]: sleepNight({ rhr: null }) }, { rhr: 49 })
    expect(await fetchNight(TODAY, 2)).toMatchObject({ requests: 2, night: { rhr: 49, rhrSource: 'day' } })
    expect(await fetchNight(TODAY, 1)).toMatchObject({ requests: 1, night: { rhr: null } })
    expect(calls).toEqual([`sleep:${TODAY}`, `hr:${TODAY}`, `sleep:${TODAY}`])
  })

  it('Fehler beim Tages-Ruhepuls: die Nacht bleibt, außer Garmin bremst', async () => {
    const night = sleepNight({ rhr: null })
    const get = async (url: string) => { if (url.includes('dailyHeartRate')) throw unavailable(); return night }
    expect(await fetchGarminNight(get, TODAY, 2)).toMatchObject({ requests: 2, night: { sleepS: 24000, rhr: null } })
    const braked = async (url: string) => { if (url.includes('dailyHeartRate')) throw rateLimited(); return night }
    await expect(fetchGarminNight(braked, TODAY, 2)).rejects.toMatchObject({ code: 'rate-limited' })
  })

  it('URLs tragen den Kalendertag unverändert', () => {
    expect(sleepUrl(TODAY)).toBe(`https://connectapi.garmin.com/sleep-service/sleep/dailySleepData?date=${TODAY}`)
    expect(heartRateUrl(TODAY)).toBe(`https://connectapi.garmin.com/wellness-service/wellness/dailyHeartRate?date=${TODAY}`)
  })
})

describe('welche Nächte ein Sync holt', () => {
  it('erster Lauf (< 7 Nächte gespeichert): 28 Tage, neueste zuerst', () => {
    const d = nightsToFetch(TODAY, [], NOW_S, dayOf)
    expect(d).toHaveLength(28)
    expect(d[0]).toBe(TODAY)
    expect(d[27]).toBe(day(-27))
  })

  it('sonst nur die letzten 7 Tage, vollständige Nächte nicht', () => {
    const rows = Array.from({ length: 10 }, (_, i) => stored(day(-1 - i)))
    expect(nightsToFetch(TODAY, rows, NOW_S, dayOf)).toEqual([TODAY])
  })

  it('leere Nacht: 3 Tage Ruhe — außer sie wurde am eigenen Morgen geholt (Daten kommen evtl. noch)', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => stored(day(-10 - i))),
      empty(TODAY, NOW_S - 3600),                                         // heute früh geholt → nochmal
      empty(day(-2), NOW_S - DAY_S),                                      // gestern geholt → warten
      empty(day(-5), NOW_S - EMPTY_RETRY_DAYS * DAY_S),                   // vor 3 Tagen → wieder holen
      stored(day(-3), { hrvAvg: null, fetchedAt: NOW_S - DAY_S }),        // ohne HRV wie leer
    ]
    expect(nightsToFetch(TODAY, rows, NOW_S, dayOf)).toEqual([TODAY, day(-1), day(-4), day(-5), day(-6)])
  })

  it('der eigene Morgen folgt der Zeitzone des Läufers (dayOf)', () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => stored(day(-10 - i))), empty(day(-1), NOW_S - DAY_S)]
    // The same instant is day −1 (its own morning: refetch) or already today (wait) depending on the runner's zone.
    expect(nightsToFetch(TODAY, rows, NOW_S, dayOf)).toContain(day(-1))
    expect(nightsToFetch(TODAY, rows, NOW_S, () => TODAY)).not.toContain(day(-1))
  })
})

describe('Wellness-Schritt im Sync', () => {
  it(`höchstens ${MAX_WELLNESS_REQUESTS} Anfragen pro Sync, leere Nächte werden gespeichert`, async () => {
    const { calls, fetchNight } = fakeGet({ [TODAY]: sleepNight() })
    const { d, saved } = deps({ fetchNight })
    const r = await syncWellness(d)
    expect(calls.length).toBeLessThanOrEqual(MAX_WELLNESS_REQUESTS)
    expect(r).toMatchObject({ fetched: 8, withData: 1, requests: 8 })
    expect(saved[0]).toHaveLength(8)
    expect(saved[0].filter((n) => n.sleepS == null)).toHaveLength(7)
  })

  it('Budget zählt den Ruhepuls-Fallback mit', async () => {
    const nights = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [day(-i), sleepNight({ rhr: null })]))
    const { calls, fetchNight } = fakeGet(nights, { rhr: 48 })
    const r = await syncWellness(deps({ fetchNight }).d)
    expect(r.requests).toBe(MAX_WELLNESS_REQUESTS)
    expect(calls).toHaveLength(MAX_WELLNESS_REQUESTS)
  })

  it('nichts zu holen → keine Anfrage', async () => {
    let n = 0
    const rows = [stored(TODAY), ...Array.from({ length: 8 }, (_, i) => stored(day(-1 - i)))]
    const r = await syncWellness(deps({ rows, fetchNight: async () => { n++; throw new Error('not expected') } }).d)
    expect(r.requests).toBe(0)
    expect(n).toBe(0)
  })

  it('eine leer zurückkommende Nacht überschreibt keine Nacht mit Daten', async () => {
    const rows = [stored(TODAY, { hrvAvg: null, fetchedAt: NOW_S - 600 }), ...Array.from({ length: 8 }, (_, i) => stored(day(-1 - i)))]
    const { d, saved } = deps({ rows })
    await syncWellness(d)
    expect(saved[0][0]).toMatchObject({ date: TODAY, sleepS: 26000, rhr: 50 })
    expect(saved[0][0]).not.toHaveProperty('fetchedAt')
  })

  it('Fehler: zwei in Folge → Schritt hört auf, gespeichert wird, was da ist; nur Fehlercodes', async () => {
    const { calls, fetchNight } = fakeGet({ [TODAY]: sleepNight() }, { failSleep: (k) => (k !== TODAY ? new Error('raw library text with secrets') : null) })
    const { d, saved } = deps({ fetchNight })
    const r = await syncWellness(d)
    expect(calls).toHaveLength(3)
    expect(r.errors).toEqual([{ date: day(-1), code: 'unknown' }, { date: day(-2), code: 'unknown' }])
    expect(saved[0].map((n) => n.date)).toEqual([TODAY])
  })

  it('Garmin bremst: sofort aufhören', async () => {
    const { calls, fetchNight } = fakeGet({}, { failSleep: () => rateLimited() })
    const r = await syncWellness(deps({ fetchNight }).d)
    expect(calls).toHaveLength(1)
    expect(r.errors).toEqual([{ date: TODAY, code: 'rate-limited' }])
  })

  it('wellnessStep wirft nie: Fehler und fehlende Tabelle landen im Log, ohne Bibliothekstext', async () => {
    const missing = Object.assign(new Error('relation "wellness_days" does not exist'), { code: '42P01' })
    const log: string[] = []
    await wellnessStep(log, async () => deps({ load: async () => { throw missing } }).d, isMissingTable)
    await wellnessStep(log, async () => deps({ save: async () => { throw new Error('connection refused to db://user:pw@host') } }).d, isMissingTable)
    await wellnessStep(log, async () => { throw new SourceError('auth', 'x') }, isMissingTable, 'garmin wellness')
    await wellnessStep(log, async () => deps({ fetchNight: fakeGet({}, { failSleep: () => unavailable() }).fetchNight }).d, isMissingTable)
    expect(log).toEqual([
      'wellness: table wellness_days missing (migration pending), skipped',
      'wellness failed (unknown)',
      'garmin wellness failed (auth)',
      'wellness: 0 nights stored (0 with data), 2 requests',
      `wellness fetch failed: ${TODAY} (unavailable)`,
      `wellness fetch failed: ${day(-1)} (unavailable)`,
    ])
  })
})

describe('isMissingTable', () => {
  it('erkennt 42P01 direkt und in cause, sonst nicht', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable(new Error('x', { cause: new Error('relation "wellness_days" does not exist') }))).toBe(true)
    expect(isMissingTable(new Error('connection refused'))).toBe(false)
    expect(isMissingTable(undefined)).toBe(false)
  })
})
