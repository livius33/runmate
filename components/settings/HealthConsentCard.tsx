'use client'

// Settings → Gesundheitsdaten (Phase 4): the separate, explicit Art. 9 consent before any source or import, its
// date and version, revocation, and after revoking the offer to delete the stored data. Hidden when not required
// (self-host).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartPulse } from 'lucide-react'
import type { HealthConsentStatus } from '@/lib/legal/consent-text'
import { Button, Card, CheckRow, Inset } from '@/components/ui'

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
    <div id="gesundheitsdaten" className="min-w-0 scroll-mt-20">
    <Card title={<span className="flex items-center gap-2"><HeartPulse className="h-4 w-4 shrink-0 text-brand" /> Gesundheitsdaten</span>}>
      {data.granted ? (
        <>
          <p className="text-body-sm text-muted-foreground">
            Du hast am {fmt(data.grantedAt)} Uhr eingewilligt (Textversion {data.version}). Runmate verarbeitet Herzfrequenz, HRV,
            Ruhepuls, Schlaf und Gewicht aus deinen Datenquellen.
          </p>
          <details className="mt-2 text-caption text-muted-foreground"><summary className="cursor-pointer">Einwilligungstext</summary>
            <div className="mt-2 grid gap-1.5">{data.text.map((t) => <p key={t}>{t}</p>)}</div></details>
          {confirmRevoke ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-caption">
              Danach kommen keine neuen Daten mehr an (Sync, Import, Apple Health).
              <Button variant="destructive" size="sm" onClick={() => revoke.mutate()} disabled={revoke.isPending}>Einwilligung widerrufen</Button>
              <Button size="sm" onClick={() => setConfirmRevoke(false)}>Abbrechen</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="-ml-2.5 mt-2" onClick={() => setConfirmRevoke(true)}>Einwilligung widerrufen</Button>
          )}
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); grant.mutate() }} className="grid gap-3 text-body-sm">
          <p className="text-muted-foreground">
            {data.revokedAt ? `Widerrufen am ${fmt(data.revokedAt)} Uhr. ` : data.version && data.version !== data.current ? 'Der Einwilligungstext hat sich geändert. ' : ''}
            Bevor du eine Datenquelle verbindest oder Dateien importierst, brauchen wir deine ausdrückliche Einwilligung – getrennt von den AGB.
          </p>
          <CheckRow className="text-caption" checked={checked} onChange={(e) => setChecked(e.target.checked)} required>
            <span className="grid gap-1.5">{data.text.map((t) => <span key={t}>{t}</span>)}</span>
          </CheckRow>
          <Button type="submit" size="action" className="w-fit" disabled={!checked || grant.isPending}>Einwilligen</Button>
        </form>
      )}
      {offerDelete && (
        <Inset className="mt-3 p-3 text-caption">
          <p>Sollen auch die gespeicherten Aktivitäten, Pulsverläufe und Apple-Health-Werte gelöscht werden? Plan, Profil und Konto bleiben.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onClick={() => wipe.mutate()} disabled={wipe.isPending}>Gesundheits- und Aktivitätsdaten löschen</Button>
            <Button size="sm" onClick={() => setOfferDelete(false)}>Behalten</Button>
          </div>
        </Inset>
      )}
      {deleted && <p className="mt-2 text-caption text-muted-foreground">Gelöscht.</p>}
      {error && <p role="alert" className="mt-2 text-caption text-error">{error.message}</p>}
    </Card>
    </div>
  )
}
