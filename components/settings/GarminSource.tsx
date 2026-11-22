'use client'

// The Garmin login source: connect with consent, its state (incl. clear error messages), sync and full history.
// Credentials go to the server once, are stored encrypted and never shown again.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, Database, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import type { LastSync, SourceInfo } from '@/lib/sources/types'
import { Button, Card, CheckRow, Chip, Field, Inset, Input, SectionHeader } from '@/components/ui'

// Data that changes after a sync or import (also components/HeaderSync.tsx).
export const AFTER_SYNC = ['sources', 'running-stats', 'runs', 'run', 'analytics', 'running-fitness', 'plan-actuals', 'plan-engine', 'running-wellness']

// What a sync did. `failed` (an activity with impossible values, one that could not be stored, detail data that did
// not come) only shows when there is one.
export const syncCounts = (s: { inserted: number; updated: number; enriched: number; failed?: number }) =>
  `${s.inserted} neu · ${s.updated} aktualisiert · ${s.enriched} ergänzt${s.failed ? ` · ${s.failed} fehlgeschlagen` : ''}`

// The history walk, while it runs and at its end. `rejected`: activities the server did not store (impossible values).
export const historyCounts = (h: { inserted: number; updated: number; rejected: number }) =>
  `${h.inserted} neu, ${h.updated} aktualisiert${h.rejected ? `, ${h.rejected} mit unmöglichen Werten nicht übernommen` : ''}`

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
  const id = `${source.id}-connect`
  return (
    <Inset className="p-3">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); connect.mutate() }}>
        <Field id={`${id}-user`} label="Garmin-E-Mail">
          <Input id={`${id}-user`} type="email" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field id={`${id}-password`} label="Garmin-Passwort">
          <Input id={`${id}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <CheckRow className="text-caption text-muted-foreground sm:col-span-2" checked={consent} onChange={(e) => setConsent(e.target.checked)} required>
          <span className="grid gap-1">{(source.consent ?? []).map((t) => <span key={t}>{t}</span>)}</span>
        </CheckRow>
        <Button type="submit" size="action" className="w-fit" disabled={connect.isPending || !consent}>
          {connect.isPending ? 'Melde an…' : 'Verbinden'}
        </Button>
        {connect.isError && <p role="alert" className="text-caption text-error sm:col-span-2">{(connect.error as Error).message}</p>}
      </form>
    </Inset>
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
      const total = { inserted: 0, updated: 0, rejected: 0 }
      for (let page = 0; ; page++) {
        setHistory(`Lade Seite ${page + 1}… (${historyCounts(total)})`)
        const d = await call<{ inserted: number; updated: number; rejected?: number; hasMore: boolean }>(`/api/sources/${source.id}/history`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page }),
        })
        total.inserted += d.inserted
        total.updated += d.updated
        total.rejected += d.rejected ?? 0
        if (!d.hasMore) return total
      }
    },
    onSuccess: (d) => { setHistory(`Fertig: ${historyCounts(d)}. Detaildaten folgen mit den nächsten Synchronisierungen.`); refresh() },
    onError: (err: Error) => setHistory(err.message),
  })

  const err = source.status.error
  const last = source.lastSync
  return (
    <Card stack>
      <SectionHeader as="h3"
        title={<span className="flex flex-wrap items-center gap-2">{source.label}{source.experimental && <Chip tone="neutral">experimentell</Chip>}</span>}
        aside={connected && !err ? <span className="flex items-center gap-1.5 text-teal-text"><CheckCircle className="h-3.5 w-3.5" /> Verbunden</span>
          : connected && err ? <span className="flex items-center gap-1.5 text-error"><AlertCircle className="h-3.5 w-3.5" /> Problem</span>
          : <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Nicht verbunden</span>} />
      <p className="text-body-sm text-muted-foreground">{source.description}</p>
      {err && <p className="rounded-card bg-destructive/10 px-3 py-2 text-caption text-error">{err.message}</p>}

      {!connected || editing ? (
        <ConnectForm source={source} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="action" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={sync.isPending ? 'animate-spin' : ''} /> Synchronisieren
            </Button>
            <Button size="action" onClick={() => full.mutate()} disabled={full.isPending}>
              <Database className={full.isPending ? 'animate-pulse' : ''} /> Gesamte Historie laden
            </Button>
            <Button variant="ghost" size="action" onClick={() => setEditing(true)}>Zugangsdaten ändern</Button>
            <Button variant="destructive" size="action" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Trennen und Zugangsdaten löschen</Button>
          </div>
          {sync.isError && <p className="text-caption text-error">{(sync.error as Error).message}</p>}
          {sync.isSuccess && sync.data.remaining > 0 && (
            <p className="text-caption text-muted-foreground">Noch {sync.data.remaining} {sync.data.remaining === 1 ? 'Lauf' : 'Läufe'} ohne Detaildaten, erneut synchronisieren.</p>
          )}
          {history && <p className={`text-caption ${full.isError ? 'text-error' : 'text-muted-foreground'}`}>{history}</p>}
        </>
      )}
      {last && (
        <p className="text-caption text-muted-foreground">
          Letzte Synchronisierung: vor {formatDistanceToNow(new Date(last.at), { locale: de })} · {syncCounts(last)}
        </p>
      )}
    </Card>
  )
}
