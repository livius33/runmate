'use client'

// This user's Garmin Connect login (Phase 2): stored encrypted on the server, never shown again. Runmate logs in to
// Garmin with it, like the Garmin Connect app.
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function GarminLogin({ hasCredentials }: { hasCredentials: boolean }) {
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [open, setOpen] = useState(!hasCredentials)
  const save = useMutation({
    mutationFn: async (method: 'PUT' | 'DELETE') => {
      const r = await fetch('/api/garmin/account', { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PUT' ? JSON.stringify({ username, password }) : undefined })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Fehlgeschlagen')
      return d
    },
    onSuccess: (_, method) => { setPassword(''); setOpen(method === 'DELETE'); qc.invalidateQueries({ queryKey: ['garmin-status'] }) },
  })
  if (!open) {
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        <button onClick={() => setOpen(true)} className="rounded-md bg-secondary px-3 py-1.5 hover:bg-secondary/80">Zugangsdaten ändern</button>
        <button onClick={() => save.mutate('DELETE')} disabled={save.isPending} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-secondary/60">Garmin trennen</button>
      </div>
    )
  }
  return (
    <form className="grid gap-2 rounded-lg border border-border p-3 text-xs sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); save.mutate('PUT') }}>
      <input className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" type="email" autoComplete="username" placeholder="Garmin-E-Mail"
        value={username} onChange={(e) => setUsername(e.target.value)} required />
      <input className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" type="password" autoComplete="current-password" placeholder="Passwort"
        value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button type="submit" disabled={save.isPending} className="rounded-md bg-secondary px-3 py-1.5 hover:bg-secondary/80 disabled:opacity-50">Speichern</button>
      <p className="text-muted-foreground sm:col-span-3">Verschlüsselt gespeichert und nie wieder angezeigt. Die nächste Synchronisierung meldet sich damit bei Garmin an.</p>
      {save.isError && <p className="text-red-400 sm:col-span-3">{(save.error as Error).message}</p>}
    </form>
  )
}
