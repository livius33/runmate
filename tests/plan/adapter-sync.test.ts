// A-05 (plan-adapter audit, phase 08): the engine only treats days covered by a sync as missed. The sync saves its
// result per source (settings 'last_sync:<id>'), while the engine still read the earlier single key that nothing writes
// any more — so no day ever counted as covered and neither a missed key session nor missed km were ever noticed.
// Writer and reader are tested together here, so the two cannot drift apart again.
//
// A-06 (08-02, open defect): runs from a file import or the Apple Health Shortcut leave no sync record at all, so for
// those runners no day was ever covered either. The newest stored run covers the days up to its date as well.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { runAsUser } from '@/lib/server/scope'
import type { ActivitySource } from '@/lib/sources/types'
import { activities } from '@/lib/db/schema'
import { rowOf, useFakeDb } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }) }))

const { garminLoginSource } = await import('@/lib/sources/garmin-login')
const { syncSource } = await import('@/lib/sources/sync')
const { loadSyncedThrough, runAndSaveEngine } = await import('@/lib/plan/engine-store')

// Settings as a per-test key/value store and the stored runs (whole rows, as the engine reads them); every other query
// answers empty.
const stored = new Map<string, string>()
let runRows: unknown[][] = []
const fake = useFakeDb((q) => {
  if (/^insert into "settings"/.test(q.sql)) stored.set(String(q.params[1]), String(q.params[2]))
  if (/^select "value" from "settings"/.test(q.sql) && stored.has(String(q.params[1]))) return [[stored.get(String(q.params[1]))]]
  if (/^select .*"metrics_json".* from "activities"/.test(q.sql)) return runRows
  return []
})
afterAll(() => fake.restore())

const asUser = <T>(fn: () => Promise<T>) => runAsUser('t-adapt-sync', fn, { profile: null })
const ago = (n: number) => format(addDays(parseISO(todayLocal()), -n), 'yyyy-MM-dd')
const fileRun = (date: string, km: number) => rowOf(activities, {
  userId: 't-adapt-sync', id: `file-${date}`, source: 'file', sourceActivityId: `f-${date}`, type: 'Run', name: 'Lauf', date,
  distanceM: km * 1000, durationS: Math.round(km * 340), averagePaceSPerKm: 340, averageHr: 130, hasDetailedData: false, hasStreams: false, syncedAt: 0,
})
const source = (listActivities: ActivitySource['listActivities']): ActivitySource =>
  ({ ...garminLoginSource, meta: { ...garminLoginSource.meta, capabilities: { ...garminLoginSource.meta.capabilities, detailStreams: false, dailyWellness: false } }, listActivities, markSynced: undefined })

describe('Audit Plan-Engine: Sync-Abdeckung', () => {
  it('A-05 ohne Sync gilt kein Tag als verpasst', async () => {
    stored.clear()
    expect(await asUser(() => loadSyncedThrough(null))).toBeNull()
  })

  it('A-05 nach einem erfolgreichen Sync sind die Tage bis gestern abgedeckt', async () => {
    stored.clear()
    await asUser(() => syncSource(source(async () => ({ items: [], hasMore: false }))))
    const yesterday = format(addDays(parseISO(todayLocal()), -1), 'yyyy-MM-dd')
    expect(await asUser(() => loadSyncedThrough(null))).toBe(yesterday)
  })

  it('A-05 ein fehlgeschlagener Sync deckt nichts ab', async () => {
    stored.clear()
    await asUser(() => syncSource(source(async () => { throw new Error('down') }))).catch(() => {})
    expect(await asUser(() => loadSyncedThrough(null))).toBeNull()
  })

  it('A-06 nur Datei-Import: abgedeckt bis zum Tag des neuesten Laufs', async () => {
    stored.clear()
    expect(await asUser(() => loadSyncedThrough(ago(3)))).toBe(ago(3))
  })

  it('A-06 fehlgeschlagener Sync, aber ein neuerer importierter Lauf: der Lauf zählt', async () => {
    stored.clear()
    await asUser(() => syncSource(source(async () => { throw new Error('down') }))).catch(() => {})
    expect(await asUser(() => loadSyncedThrough(ago(2)))).toBe(ago(2))
  })

  it('A-06 erfolgreicher Sync nach dem neuesten Lauf: der Sync-Tag zählt; ein Lauf von heute geht darüber', async () => {
    stored.clear()
    await asUser(() => syncSource(source(async () => ({ items: [], hasMore: false }))))
    expect(await asUser(() => loadSyncedThrough(ago(5)))).toBe(ago(1))
    expect(await asUser(() => loadSyncedThrough(ago(0)))).toBe(ago(0))
  })

  // The whole way, as the engine runs for a runner who only uploads files (no sync record): week 41 of the example
  // block, Monday 13 km planned and 7 km run. On Tuesday the 6 missing km are spread — before, nothing happened.
  const KW40 = [['2026-09-28', 20], ['2026-09-29', 18], ['2026-09-30', 14], ['2026-10-01', 13], ['2026-10-03', 30], ['2026-10-04', 10]] as const
  it('A-06 nur Datei-Import: die Engine bemerkt verpasste Kilometer', async () => {
    stored.clear()
    runRows = [...KW40, ['2026-10-05', 7] as const].map(([d, km]) => fileRun(d, km))
    const r = await asUser(() => runAndSaveEngine('2026-10-06'))
    expect(r.log.filter((c) => c.rule === 'rebalance' && c.status === 'active').map((c) => [c.addedKm, Object.keys(c.after)])).toEqual([[6, ['2026-10-07', '2026-10-08']]])
  })

  // An import of old history ends at its last run: the days after it are not covered, so nothing there is missed.
  it('A-06 alter Import: die Tage nach dem letzten Lauf gelten nicht als verpasst', async () => {
    stored.clear()
    runRows = KW40.slice(0, 2).map(([d, km]) => fileRun(d, km))            // last run: Tue 29.9.
    const r = await asUser(() => runAndSaveEngine('2026-10-06'))
    expect(r.log).toEqual([])
    runRows = []
  })

  it('A-06 ohne Läufe und ohne Sync bleibt die Engine still', async () => {
    stored.clear()
    runRows = []
    expect((await asUser(() => runAndSaveEngine('2026-10-06'))).log).toEqual([])
  })
})
