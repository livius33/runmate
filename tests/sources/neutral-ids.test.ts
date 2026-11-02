// AC-2 (Phase 3): activities are keyed by source + source id. No code outside the Garmin source knows Garmin's id
// column, and only lib/sources/ingest.ts (plus manual entries) writes activities.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getTableColumns } from 'drizzle-orm'
import { activities, activityStreams } from '@/lib/db/schema'

const ROOTS = ['app', 'lib', 'components', 'scripts']
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts|mjs)$/.test(p) ? [p] : []
  })
}
const sources = ROOTS.flatMap(files).map((f) => [f, readFileSync(f, 'utf8')] as const)

describe('Neutrale Quell-IDs', () => {
  it('Schema: source + source_activity_id, keine Garmin-/Strava-Spalten', () => {
    const cols = Object.values(getTableColumns(activities)).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['source', 'source_activity_id', 'started_at']))
    expect(cols).not.toEqual(expect.arrayContaining(['garmin_activity_id']))
    expect([...cols, ...Object.values(getTableColumns(activityStreams)).map((c) => c.name)].some((c) => c.startsWith('strava'))).toBe(false)
  })

  it('kein Code liest garminActivityId; Aktivitäten schreibt nur die Ingest-Schicht', () => {
    expect(sources.filter(([, s]) => /garminActivityId|garmin_activity_id/.test(s)).map(([f]) => f)).toEqual([])
    const writers = sources.filter(([, s]) => /insert\(activities\)/.test(s)).map(([f]) => f).sort()
    // lib/demo/store.ts writes the synthetic demo athlete only, already normalised (Phase 5), never source data.
    expect(writers).toEqual(['app/api/cross-training/route.ts', 'lib/demo/store.ts', 'lib/sources/ingest.ts'])
  })
})
