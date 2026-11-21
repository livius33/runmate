'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Link2, RefreshCw } from 'lucide-react'
import type { SourcesResponse } from '@/lib/sources/types'
import { AFTER_SYNC } from '@/components/settings/GarminSource'
import { cn } from '@/lib/utils'
import { useOnline } from '@/components/Offline'

// A 429 is the sync cooldown (12-04, once a minute): not a failure. Shown neutrally, the server's message as the title.
export class SyncCooldown extends Error {}
export function syncError(status: number, data: { error?: string } | null): Error {
  if (status === 429) return new SyncCooldown(data?.error ?? 'Gerade erst synchronisiert. Bitte kurz warten.')
  return new Error(data?.error ?? 'Synchronisierung fehlgeschlagen')
}

// Sync from every page: one tap, spins while running, then the result and the time.
export function HeaderSync() {
  const qc = useQueryClient()
  const online = useOnline()
  const { data: status } = useQuery<SourcesResponse>({
    queryKey: ['sources'],
    queryFn: () => fetch('/api/sources').then((r) => r.json()),
    staleTime: 60_000,
  })
  const sync = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/sources/sync', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw syncError(r.status, data)
      return data as { inserted: number }
    },
    onSettled: () => { for (const key of AFTER_SYNC) qc.invalidateQueries({ queryKey: [key] }) },
  })

  const last = status?.lastSync
  const cooling = sync.error instanceof SyncCooldown
  const failed = sync.isError && !cooling
  const text = !online ? 'Offline'
    : sync.isPending ? 'Synchronisiere…'
    : cooling ? 'Gleich wieder möglich'
    : failed ? 'Sync fehlgeschlagen'
      : last ? `${sync.isSuccess ? `${sync.data.inserted} neu · ` : ''}vor ${formatDistanceToNow(new Date(last.at), { locale: de })}`
        : 'Noch nie synchronisiert'

  // Nothing to synchronise by hand (no pull source): the button leads to where one is connected or files are
  // uploaded. The file import always counts as connected, so it does not decide this. With a push source
  // (Apple Health) the data arrives by itself and the header stays empty.
  if (status && status.canSync === false) {
    if (status.sources.some((s) => s.id !== 'file' && s.status.connected)) return null
    return (
      <Link href="/settings#datenquellen" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary">
        <Link2 className="h-3.5 w-3.5" />
        <span className="max-w-[9rem] truncate sm:max-w-none">Datenquelle verbinden</span>
      </Link>
    )
  }

  return (
    <button onClick={() => sync.mutate()} disabled={!online || sync.isPending || status?.canSync === false}
      title={sync.isError ? (sync.error as Error).message : 'Datenquellen synchronisieren'}
      className={cn('inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary disabled:opacity-60',
        failed && 'border-brand/40 text-brand')}>
      <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
      <span className="max-w-[9rem] truncate tabular-nums sm:max-w-none">{text}</span>
    </button>
  )
}
