'use client'

// Settings → Gesundheitsdaten (Phase 4): the separate, explicit Art. 9 consent before any source or import, its
// date and version, revocation, and after revoking the offer to delete the stored data. Hidden when not required
// (self-host).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartPulse } from 'lucide-react'
import type { HealthConsentStatus } from '@/lib/legal/consent-text'

const fmt = (t: number | null) => (t ? new Date(t * 1000).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–')

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? 'Fehlgeschlagen')
  return d
}

export function HealthConsentCard() {
  const qc = useQueryClient()
  const { data } = useQuery<HealthConsentStatus>({ queryKey: ['health-consent'], queryFn: () => fetch('/api/consent/health').then((r) => r.json()) })
  const [checked, setChecked] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [offerDelete, setOfferDelete] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const set = (s: HealthConsentStatus) => qc.setQueryData(['health-consent'], s)
  const grant = useMutation({ mutationFn: () => call('/api/consent/health', 'PUT', { version: data!.current, consent: true }), onSuccess: (s) => { set(s); setChecked(false); setDeleted(false) } })
  const revoke = useMutation({ mutationFn: () => call('/api/consent/health', 'DELETE'), onSuccess: (s) => { set(s); setConfirmRevoke(false); setOfferDelete(true) } })
  const wipe = useMutation({
    mutationFn: () => call('/api/account/health-data', 'DELETE', { confirm: true }),
    onSuccess: () => { setOfferDelete(false); setDeleted(true); qc.invalidateQueries() },
  })

  if (!data?.required) return null
  const error = (grant.error ?? revoke.error ?? wipe.error) as Error | null

  return (
    <div id="gesundheitsdaten" className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><HeartPulse className="h-4 w-4 text-brand" /> Gesundheitsdaten</h2>
      {data.granted ? (
        <>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Du hast am {fmt(data.grantedAt)} Uhr eingewilligt (Textversion {data.version}). Runmate verarbeitet Herzfrequenz, HRV,
            Ruhepuls, Schlaf und Gewicht aus deinen Datenquellen.
          </p>
          <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Einwilligungstext</summary>
            <div className="mt-2 grid gap-1.5">{data.text.map((t) => <p key={t}>{t}</p>)}</div></details>
          {confirmRevoke ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              Danach kommen keine neuen Daten mehr an (Sync, Import, Apple Health).
              <button onClick={() => revoke.mutate()} disabled={revoke.isPending} className="rounded bg-brand px-2 py-1 text-white">Einwilligung widerrufen</button>
              <button onClick={() => setConfirmRevoke(false)} className="rounded border border-border px-2 py-1">Abbrechen</button>
            </div>
          ) : (
            <button onClick={() => setConfirmRevoke(true)} className="mt-3 text-xs text-muted-foreground underline hover:text-brand">Einwilligung widerrufen</button>
          )}
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); grant.mutate() }} className="mt-1.5 grid gap-3 text-sm">
          <p className="text-muted-foreground">
            {data.revokedAt ? `Widerrufen am ${fmt(data.revokedAt)} Uhr. ` : data.version && data.version !== data.current ? 'Der Einwilligungstext hat sich geändert. ' : ''}
            Bevor du eine Datenquelle verbindest oder Dateien importierst, brauchen wir deine ausdrückliche Einwilligung – getrennt von den AGB.
          </p>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} required />
            <span className="grid gap-1.5">{data.text.map((t) => <span key={t}>{t}</span>)}</span>
          </label>
          <button type="submit" disabled={!checked || grant.isPending} className="w-fit rounded-md bg-brand px-3 py-1.5 text-white disabled:opacity-50">Einwilligen</button>
        </form>
      )}
      {offerDelete && (
        <div className="mt-3 rounded-xl border border-border p-3 text-xs">
          <p>Sollen auch die gespeicherten Aktivitäten, Pulsverläufe und Apple-Health-Werte gelöscht werden? Plan, Profil und Konto bleiben.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => wipe.mutate()} disabled={wipe.isPending} className="rounded bg-brand px-2 py-1 text-white">Gesundheits- und Aktivitätsdaten löschen</button>
            <button onClick={() => setOfferDelete(false)} className="rounded border border-border px-2 py-1">Behalten</button>
          </div>
        </div>
      )}
      {deleted && <p className="mt-2 text-xs text-muted-foreground">Gelöscht.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error.message}</p>}
    </div>
  )
}
