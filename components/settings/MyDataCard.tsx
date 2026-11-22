'use client'

// Settings → Meine Daten (Phase 4): export everything (Art. 20) and delete the account (Art. 17). Open in every plan
// state, also without an active subscription.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, Trash2 } from 'lucide-react'
import { Disclaimer } from '@/components/legal/Disclaimer'
import { LegalLinks } from '@/components/legal/LegalFooter'
import { Button, Card, Input } from '@/components/ui'

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
    <div id="meine-daten" className="min-w-0 scroll-mt-20">
    <Card title="Meine Daten">
      <p className="text-body-sm text-muted-foreground">
        Alles, was Runmate über dich gespeichert hat, als ZIP mit einer JSON-Datei je Tabelle (Aktivitäten, Pulsverläufe,
        Plan, Einstellungen, Profil, Abo, Einwilligungen). Zugangsdaten und geheime Links sind nicht enthalten.
      </p>
      <Button asChild size="action" className="mt-3">
        <a href="/api/account/export"><Download /> Alle Daten exportieren</a>
      </Button>

      <div className="mt-5 border-t border-border pt-4">
        {!open ? (
          <Button variant="ghost" size="action" className="-ml-2.5" onClick={() => setOpen(true)}>
            <Trash2 /> Konto löschen
          </Button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); del.mutate() }} className="grid gap-3 text-body-sm">
            <p id="delete-account-hint">
              Das löscht sofort und endgültig alle deine Daten bei Runmate und dein Konto; ein laufendes Abo wird sofort beendet.
              Exportiere vorher, was du behalten willst. Zum Bestätigen <b className="font-semibold">{PHRASE}</b> eingeben:
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-48" aria-label="Bestätigung" aria-describedby="delete-account-hint" />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" disabled={typed !== PHRASE || del.isPending}>{del.isPending ? 'Wird gelöscht…' : 'Konto endgültig löschen'}</Button>
              <Button onClick={() => { setOpen(false); setTyped('') }}>Abbrechen</Button>
            </div>
            {del.isError && <p role="alert" className="text-caption text-error">{(del.error as Error).message}</p>}
          </form>
        )}
      </div>

      <div className="mt-5 grid gap-2 border-t border-border pt-4">
        <LegalLinks />
        <Disclaimer />
      </div>
    </Card>
    </div>
  )
}
