'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckCircle, AlertCircle, RefreshCw, Database } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import type { LastSync } from '@/lib/garmin/sync-job'
import { CalendarCard } from '@/components/settings/CalendarCard'
import { HealthCard } from '@/components/settings/HealthCard'
import { ProfileCard } from '@/components/settings/ProfileCard'
import { GarminLogin } from '@/components/settings/GarminLogin'

const syncCounts = (s: { inserted: number; updated: number; enriched: number }) =>
  `${s.inserted} neu · ${s.updated} aktualisiert · ${s.enriched} ergänzt`

export default function SettingsPage() {
  const qc = useQueryClient()

  const { data: status, isLoading } = useQuery<{ hasCredentials: boolean; hasSession: boolean; sessionUpdatedAt: number | null; lastSync: LastSync | null }>({
    queryKey: ['garmin-status'],
    queryFn: () => fetch('/api/garmin/status').then((r) => r.json()),
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/garmin/sync', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Synchronisierung fehlgeschlagen')
      return data as LastSync
    },
    onSettled: () => {
      for (const key of ['garmin-status', 'running-stats', 'runs', 'run', 'analytics', 'running-fitness', 'plan-actuals', 'plan-engine'])
        qc.invalidateQueries({ queryKey: [key] })
    },
  })

  const [fullSyncProgress, setFullSyncProgress] = useState<string | null>(null)
  const fullSyncMutation = useMutation({
    mutationFn: async () => {
      setFullSyncProgress('Syncing page 0…')
      let page = 0
      let totalInserted = 0
      let totalUpdated = 0
      while (true) {
        const res = await fetch('/api/garmin/sync-full', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Sync failed')
        totalInserted += data.inserted ?? 0
        totalUpdated += data.updated ?? 0
        if (!data.hasMore) break
        page++
        setFullSyncProgress(`Syncing page ${page}… (${totalInserted} new, ${totalUpdated} updated)`)
      }
      return { totalInserted, totalUpdated }
    },
    onSuccess: (data) => {
      setFullSyncProgress(`Done — ${data.totalInserted} new, ${data.totalUpdated} updated`)
      qc.invalidateQueries({ queryKey: ['running-stats'] })
      setTimeout(() => setFullSyncProgress(null), 5000)
    },
    onError: (err: Error) => setFullSyncProgress(`Error: ${err.message}`),
  })

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>

  const connected = !!status?.hasCredentials && !!status?.hasSession
  const lastLogin = status?.sessionUpdatedAt
    ? new Date(status.sessionUpdatedAt * 1000).toLocaleString()
    : null

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-lg font-semibold">Settings</h1>

      <ProfileCard />
      <CalendarCard />
      <HealthCard />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Garmin Connect</h2>
          {connected
            ? <span className="flex items-center gap-1.5 text-xs text-green-500"><CheckCircle className="h-3.5 w-3.5" /> Connected</span>
            : <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" /> Not connected</span>
          }
        </div>

        <GarminLogin key={String(!!status?.hasCredentials)} hasCredentials={!!status?.hasCredentials} />

        {status?.hasCredentials && !status?.hasSession && (
          <p className="text-xs text-muted-foreground">
            Credentials found. First sync will log in to Garmin and cache the session.
          </p>
        )}

        {lastLogin && (
          <p className="text-xs text-muted-foreground">Session cached: {lastLogin}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={!status?.hasCredentials || syncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-secondary hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Synchronisieren
          </button>
          <button
            onClick={() => fullSyncMutation.mutate()}
            disabled={!status?.hasCredentials || fullSyncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-secondary hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            <Database className={`h-3.5 w-3.5 ${fullSyncMutation.isPending ? 'animate-pulse' : ''}`} />
            Gesamte Historie laden
          </button>
        </div>

        {syncMutation.isSuccess && !syncMutation.isPending && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>{syncCounts(syncMutation.data)}</p>
            {syncMutation.data.remaining > 0 && (
              <p>Noch {syncMutation.data.remaining} {syncMutation.data.remaining === 1 ? 'Lauf' : 'Läufe'} ohne Detaildaten, erneut synchronisieren</p>
            )}
          </div>
        )}
        {syncMutation.isError && (
          <p className="text-xs text-red-400">{(syncMutation.error as Error).message}</p>
        )}
        {fullSyncProgress && (
          <p className={`text-xs font-mono ${fullSyncMutation.isError ? 'text-red-400' : 'text-muted-foreground'}`}>
            {fullSyncProgress}
          </p>
        )}
        {status?.lastSync && (
          <p className="text-xs text-muted-foreground">
            Letzte Synchronisierung: vor {formatDistanceToNow(new Date(status.lastSync.at), { locale: de })}
            {' · '}{syncCounts(status.lastSync)}
            {status.lastSync.error && <span className="block text-red-400">Fehler: {status.lastSync.error}</span>}
          </p>
        )}
      </section>
    </div>
  )
}
