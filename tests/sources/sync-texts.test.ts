// 08-02 follow-up: what the Garmin card says about activities a sync or the history walk did not take over. Before,
// the server counted them (`failed`, `rejected`) and the card showed neither.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GarminSource, historyCounts, syncCounts } from '@/components/settings/GarminSource'
import type { LastSync, SourceInfo } from '@/lib/sources/types'

const sync = (o: Partial<LastSync>): LastSync => ({ at: new Date().toISOString(), source: 'garmin', inserted: 3, updated: 1, duplicates: 0, enriched: 2, failed: 0, remaining: 0, ...o })
const card = (lastSync: LastSync) => {
  const source = {
    id: 'garmin', label: 'Garmin', description: '', auth: 'credentials', available: true,
    capabilities: { activities: true, detailStreams: true, dailyWellness: true, mode: 'pull', history: true, runs: true },
    status: { connected: true, lastSyncAt: null, error: null }, lastSync,
  } as SourceInfo
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(GarminSource, { source })))
}

describe('Garmin-Karte: was nicht übernommen wurde', () => {
  it('letzte Synchronisierung nennt Fehlgeschlagenes, wenn es welches gab', () => {
    expect(card(sync({ failed: 2 }))).toContain('3 neu · 1 aktualisiert · 2 ergänzt · 2 fehlgeschlagen')
    const clean = card(sync({}))
    expect(clean).toContain('3 neu · 1 aktualisiert · 2 ergänzt')
    expect(clean).not.toContain('fehlgeschlagen')
  })

  it('ein Eintrag von vor der Zählung (ohne failed) bleibt lesbar', () => {
    expect(syncCounts({ inserted: 1, updated: 0, enriched: 0 })).toBe('1 neu · 0 aktualisiert · 0 ergänzt')
  })

  it('Historie: Aktivitäten mit unmöglichen Werten stehen im Zwischenstand und im Ergebnis', () => {
    expect(historyCounts({ inserted: 120, updated: 4, rejected: 0 })).toBe('120 neu, 4 aktualisiert')
    expect(historyCounts({ inserted: 120, updated: 4, rejected: 1 })).toBe('120 neu, 4 aktualisiert, 1 mit unmöglichen Werten nicht übernommen')
  })
})
