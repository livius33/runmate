'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { RefreshCw } from 'lucide-react'
import type { LastSync } from '@/lib/garmin/sync-job'
import { cn } from '@/lib/utils'
import { useOnline } from '@/components/Offline'

// Data that changes after a sync (same as the settings page).
const REFRESH = ['garmin-status', 'running-stats', 'runs', 'run', 'analytics', 'running-fitness', 'plan-actuals', 'plan-engine']

// Sync from every page: one tap, spins while running, then the result and the time.
export function HeaderSync() {
  const qc = useQueryClient()
  const online = useOnline()
  const { data: status } = useQuery<{ hasCredentials: boolean; lastSync: LastSync | null }>({
    queryKey: ['garmin-status'],
    queryFn: () => fetch('/api/garmin/status').then((r) => r.json()),
    staleTime: 60_000,
  })
  const sync = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/garmin/sync', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Synchronisierung fehlgeschlagen')
      return data as LastSync
    },
    onSettled: () => { for (const key of REFRESH) qc.invalidateQueries({ queryKey: [key] }) },
  })

  const last = status?.lastSync
  const text = !online ? 'Offline'
    : sync.isPending ? 'Synchronisiere…'
    : sync.isError ? 'Sync fehlgeschlagen'
      : last ? `${sync.isSuccess ? `${sync.data.inserted} neu · ` : ''}vor ${formatDistanceToNow(new Date(last.at), { locale: de })}`
        : 'Noch nie synchronisiert'

  return (
    <button onClick={() => sync.mutate()} disabled={!online || sync.isPending || status?.hasCredentials === false}
      title={sync.isError ? (sync.error as Error).message : 'Mit Garmin synchronisieren'}
      className={cn('inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-60',
        sync.isError && 'border-brand/40 text-brand')}>
      <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
      <span className="max-w-[9rem] truncate tabular-nums sm:max-w-none">{text}</span>
    </button>
  )
}
