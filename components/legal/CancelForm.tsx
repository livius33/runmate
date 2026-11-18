'use client'

// The confirmation step of the cancellation button (§312k BGB): what kind of cancellation, which contract (signed in:
// the account's own; otherwise name + account email), then "Jetzt kündigen" and an on-screen confirmation with date
// and time that can be saved or printed.
import { useState } from 'react'

type Result = { at: number; endsAt?: number | null; kind?: 'subscription' | 'trial' | 'none' }

const fmt = (t: number, time = false) => new Date(t * 1000).toLocaleString('de-DE', time
  ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  : { day: 'numeric', month: 'long', year: 'numeric' })

export function CancelForm({ signedIn, contract }: { signedIn: boolean; contract: string | null }) {
  const [kind, setKind] = useState<'ordentlich' | 'ausserordentlich'>('ordentlich')
  const [reason, setReason] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Result | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body = { kind, reason: kind === 'ausserordentlich' ? reason : undefined, ...(signedIn ? {} : { name, email }) }
    const r = await fetch(signedIn ? '/api/billing/cancel' : '/api/billing/cancel-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    setBusy(false)
    if (!r?.ok) return setError(d?.error ?? 'Die Kündigung konnte nicht übermittelt werden. Bitte noch einmal versuchen.')
    setDone(d as Result)
  }

  if (done) return (
    <div role="status" className="grid gap-2 rounded-2xl border border-border bg-card p-5 text-sm">
      <p className="text-base font-semibold">Kündigung eingegangen</p>
      <p>Eingang: {fmt(done.at, true)} Uhr · Art: {kind === 'ordentlich' ? 'ordentliche Kündigung zum nächstmöglichen Zeitpunkt' : 'außerordentliche Kündigung'}</p>
      {signedIn && done.kind === 'subscription' && <p>Dein Abo endet am <b>{done.endsAt ? fmt(done.endsAt) : 'Ende des bezahlten Zeitraums'}</b>. Bis dahin bleibt alles nutzbar; danach wird nichts mehr abgebucht und dein Konto läuft kostenlos weiter.</p>}
      {signedIn && done.kind === 'trial' && <p>Du bist in der kostenlosen Testphase ohne Zahlungsdaten. Sie endet am {done.endsAt ? fmt(done.endsAt) : '–'} von selbst; es entsteht kein Abo. Danach nutzt du Runmate kostenlos weiter.</p>}
      {signedIn && done.kind === 'none' && <p>Zu deinem Konto besteht kein laufendes Abo. Es wird nichts abgebucht.</p>}
      {!signedIn && <p>Besteht zu dieser E-Mail-Adresse ein Abo, ist es zum Ende des bezahlten Zeitraums gekündigt.</p>}
      {kind === 'ausserordentlich' && <p>Die außerordentliche Kündigung prüfen wir und melden uns; das Abo endet spätestens zum Ende des bezahlten Zeitraums.</p>}
      <p className="text-xs text-muted-foreground">Bitte speichere oder drucke diese Bestätigung.</p>
      <button onClick={() => window.print()} className="w-fit rounded-lg border border-border px-3 py-1.5 text-xs">Drucken / als PDF speichern</button>
    </div>
  )

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-card p-5 text-sm">
      <div>
        <p className="font-medium">Vertrag</p>
        <p className="text-muted-foreground">{contract ?? 'Dein Runmate-Abo (über die E-Mail-Adresse deines Kontos zugeordnet)'}</p>
      </div>
      {!signedIn && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">Vor- und Nachname</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="grid gap-1"><span className="text-xs text-muted-foreground">E-Mail-Adresse deines Runmate-Kontos</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="rounded-lg border border-border bg-background px-3 py-2" /></label>
        </div>
      )}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 font-medium">Art der Kündigung</legend>
        <label className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === 'ordentlich'} onChange={() => setKind('ordentlich')} /> Ordentliche Kündigung zum nächstmöglichen Zeitpunkt</label>
        <label className="flex items-center gap-2"><input type="radio" name="kind" checked={kind === 'ausserordentlich'} onChange={() => setKind('ausserordentlich')} /> Außerordentliche Kündigung (aus wichtigem Grund)</label>
      </fieldset>
      {kind === 'ausserordentlich' && (
        <label className="grid gap-1"><span className="text-xs text-muted-foreground">Grund</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} className="rounded-lg border border-border bg-background px-3 py-2" /></label>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="w-fit rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-60">{busy ? 'Wird übermittelt…' : 'Jetzt kündigen'}</button>
    </form>
  )
}
