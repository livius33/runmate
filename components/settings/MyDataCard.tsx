'use client'

// Settings → Meine Daten (Phase 4): export everything (Art. 20) and delete the account (Art. 17). Open in every plan
// state, also without an active subscription.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, Trash2 } from 'lucide-react'
import { Disclaimer } from '@/components/legal/Disclaimer'
import { LegalLinks } from '@/components/legal/LegalFooter'

const PHRASE = 'LÖSCHEN'

export function MyDataCard() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const del = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Löschen fehlgeschlagen')
    },
    onSuccess: () => { window.location.href = '/sign-in' },
  })

  return (
    <div id="meine-daten" className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[15px] font-semibold">Meine Daten</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Alles, was Runmate über dich gespeichert hat, als ZIP mit einer JSON-Datei je Tabelle (Aktivitäten, Pulsverläufe,
        Plan, Einstellungen, Profil, Abo, Einwilligungen). Zugangsdaten und geheime Links sind nicht enthalten.
      </p>
      <a href="/api/account/export" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:border-foreground/50">
        <Download className="h-4 w-4" /> Alle Daten exportieren
      </a>

      <div className="mt-5 border-t border-border pt-4">
        {!open ? (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-600">
            <Trash2 className="h-4 w-4" /> Konto löschen
          </button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); del.mutate() }} className="grid gap-2 text-sm">
            <p>
              Das löscht sofort und endgültig alle deine Daten bei Runmate und dein Konto; ein laufendes Abo wird sofort beendet.
              Exportiere vorher, was du behalten willst. Zum Bestätigen <b>{PHRASE}</b> eingeben:
            </p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-48 rounded-lg border border-border bg-background px-3 py-1.5" aria-label="Bestätigung" />
            <div className="flex gap-2">
              <button type="submit" disabled={typed !== PHRASE || del.isPending} className="rounded-lg bg-red-600 px-3 py-1.5 text-white disabled:opacity-50">{del.isPending ? 'Wird gelöscht…' : 'Konto endgültig löschen'}</button>
              <button type="button" onClick={() => { setOpen(false); setTyped('') }} className="rounded-lg border border-border px-3 py-1.5">Abbrechen</button>
            </div>
            {del.isError && <p className="text-xs text-red-600">{(del.error as Error).message}</p>}
          </form>
        )}
      </div>

      <div className="mt-5 grid gap-2 border-t border-border pt-4">
        <LegalLinks />
        <Disclaimer />
      </div>
    </div>
  )
}
