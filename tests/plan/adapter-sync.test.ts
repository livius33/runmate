// A-05 (plan-adapter audit, phase 08): the engine only treats days covered by a sync as missed. The sync saves its
// result per source (settings 'last_sync:<id>'), while the engine still read the earlier single key that nothing writes
// any more — so no day ever counted as covered and neither a missed key session nor missed km were ever noticed.
// Writer and reader are tested together here, so the two cannot drift apart again.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { runAsUser } from '@/lib/server/scope'
import type { ActivitySource } from '@/lib/sources/types'
import { useFakeDb } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }) }))

const { garminLoginSource } = await import('@/lib/sources/garmin-login')
const { syncSource } = await import('@/lib/sources/sync')
const { loadSyncedThrough } = await import('@/lib/plan/engine-store')

// Settings as a per-test key/value store; every other query answers empty.
const stored = new Map<string, string>()
const fake = useFakeDb((q) => {
  if (/^insert into "settings"/.test(q.sql)) stored.set(String(q.params[1]), String(q.params[2]))
  if (/^select "value" from "settings"/.test(q.sql) && stored.has(String(q.params[1]))) return [[stored.get(String(q.params[1]))]]
  return []
})
afterAll(() => fake.restore())

const asUser = <T>(fn: () => Promise<T>) => runAsUser('t-adapt-sync', fn, { profile: null })
const source = (listActivities: ActivitySource['listActivities']): ActivitySource =>
  ({ ...garminLoginSource, meta: { ...garminLoginSource.meta, capabilities: { ...garminLoginSource.meta.capabilities, detailStreams: false, dailyWellness: false } }, listActivities, markSynced: undefined })

describe('Audit Plan-Engine: Sync-Abdeckung', () => {
  it('A-05 ohne Sync gilt kein Tag als verpasst', async () => {
    stored.clear()
    expect(await asUser(() => loadSyncedThrough())).toBeNull()
  })

  it('A-05 nach einem erfolgreichen Sync sind die Tage bis gestern abgedeckt', async () => {
    stored.clear()
    await asUser(() => syncSource(source(async () => ({ items: [], hasMore: false }))))
    const yesterday = format(addDays(parseISO(todayLocal()), -1), 'yyyy-MM-dd')
    expect(await asUser(() => loadSyncedThrough())).toBe(yesterday)
  })

  it('A-05 ein fehlgeschlagener Sync deckt nichts ab', async () => {
    stored.clear()
    await asUser(() => syncSource(source(async () => { throw new Error('down') }))).catch(() => {})
    expect(await asUser(() => loadSyncedThrough())).toBeNull()
  })
})
