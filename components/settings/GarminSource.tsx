'use client'

// The Garmin login source: connect with consent, its state (incl. clear error messages), sync and full history.
// Credentials go to the server once, are stored encrypted and never shown again.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, Database, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import type { LastSync, SourceInfo } from '@/lib/sources/types'

// Data that changes after a sync or import (also components/HeaderSync.tsx).
export const AFTER_SYNC = ['sources', 'running-stats', 'runs', 'run', 'analytics', 'running-fitness', 'plan-actuals', 'plan-engine']

const syncCounts = (s: { inserted: number; updated: number; enriched: number }) =>
  `${s.inserted} neu · ${s.updated} aktualisiert · ${s.enriched} ergänzt`

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? 'Fehlgeschlagen')
  return d as T
}

function ConnectForm({ source, onDone }: { source: SourceInfo; onDone: () => void }) {
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const connect = useMutation({
    mutationFn: () => call(`/api/sources/${source.id}/connection`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, consent }),
    }),
    onSuccess: () => { setPassword(''); onDone(); qc.invalidateQueries({ queryKey: ['sources'] }) },
    onError: () => setPassword(''),
  })
  return (
    <form className="grid gap-2 rounded-lg border border-border p-3 text-xs sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); connect.mutate() }}>
      <input className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" type="email" autoComplete="username" placeholder="Garmin-E-Mail"
        value={username} onChange={(e) => setUsername(e.target.value)} required />
      <input className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" type="password" autoComplete="current-password" placeholder="Garmin-Passwort"
        value={password} onChange={(e) => setPassword(e.target.value)} required />
      <label className="flex items-start gap-2 text-muted-foreground sm:col-span-2">
        <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span className="grid gap-1">{(source.consent ?? []).map((t) => <span key={t}>{t}</span>)}</span>
      </label>
      <button type="submit" disabled={connect.isPending || !consent} className="w-fit rounded-md bg-brand px-3 py-1.5 text-white disabled:opacity-50">
        {connect.isPending ? 'Melde an…' : 'Verbinden'}
      </button>
      {connect.isError && <p className="text-red-400 sm:col-span-2">{(connect.error as Error).message}</p>}
    </form>
  )
}

export function GarminSource({ source }: { source: SourceInfo }) {
  const qc = useQueryClient()
  const connected = source.status.connected
  const [editing, setEditing] = useState(false)
  const refresh = () => { for (const key of AFTER_SYNC) qc.invalidateQueries({ queryKey: [key] }) }

  const sync = useMutation({ mutationFn: () => call<LastSync>('/api/sources/sync', { method: 'POST' }), onSettled: refresh })
  const disconnect = useMutation({ mutationFn: () => call(`/api/sources/${source.id}/connection`, { method: 'DELETE' }), onSettled: refresh })

  const [history, setHistory] = useState<string | null>(null)
  const full = useMutation({
    mutationFn: async () => {
      let page = 0, inserted = 0, updated = 0
      for (;;) {
        setHistory(`Lade Seite ${page + 1}… (${inserted} neu, ${updated} aktualisiert)`)
        const d = await call<{ inserted: number; updated: number; hasMore: boolean }>(`/api/sources/${source.id}/history`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page }),
        })
        inserted += d.inserted
        updated += d.updated
        if (!d.hasMore) return { inserted, updated }
        page++
      }
    },
    onSuccess: (d) => { setHistory(`Fertig: ${d.inserted} neu, ${d.updated} aktualisiert. Detaildaten folgen mit den nächsten Synchronisierungen.`); refresh() },
    onError: (err: Error) => setHistory(err.message),
  })

  const err = source.status.error
  const last = source.lastSync
  return (
    <section className="grid gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          {source.label}
          {source.experimental && <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">experimentell</span>}
        </h3>
        {connected && !err && <span className="flex items-center gap-1.5 text-xs text-green-500"><CheckCircle className="h-3.5 w-3.5" /> Verbunden</span>}
        {connected && err && <span className="flex items-center gap-1.5 text-xs text-red-400"><AlertCircle className="h-3.5 w-3.5" /> Problem</span>}
        {!connected && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" /> Nicht verbunden</span>}
      </div>
      <p className="text-sm text-muted-foreground">{source.description}</p>
      {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{err.message}</p>}

      {!connected || editing ? (
        <ConnectForm source={source} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <button onClick={() => sync.mutate()} disabled={sync.isPending} className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 hover:bg-secondary/80 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} /> Synchronisieren
            </button>
            <button onClick={() => full.mutate()} disabled={full.isPending} className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 hover:bg-secondary/80 disabled:opacity-50">
              <Database className={`h-3.5 w-3.5 ${full.isPending ? 'animate-pulse' : ''}`} /> Gesamte Historie laden
            </button>
            <button onClick={() => setEditing(true)} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary/60">Zugangsdaten ändern</button>
            <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary/60">Trennen und Zugangsdaten löschen</button>
          </div>
          {sync.isError && <p className="text-xs text-red-400">{(sync.error as Error).message}</p>}
          {sync.isSuccess && sync.data.remaining > 0 && (
            <p className="text-xs text-muted-foreground">Noch {sync.data.remaining} {sync.data.remaining === 1 ? 'Lauf' : 'Läufe'} ohne Detaildaten, erneut synchronisieren.</p>
          )}
          {history && <p className={`text-xs ${full.isError ? 'text-red-400' : 'text-muted-foreground'}`}>{history}</p>}
        </>
      )}
      {last && (
        <p className="text-xs text-muted-foreground">
          Letzte Synchronisierung: vor {formatDistanceToNow(new Date(last.at), { locale: de })} · {syncCounts(last)}
        </p>
      )}
    </section>
  )
}
