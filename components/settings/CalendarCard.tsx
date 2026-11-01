'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Copy, RefreshCw } from 'lucide-react'

// Private calendar subscription: the plan as all-day events in Apple Calendar (or any calendar app).
export function CalendarCard() {
  const qc = useQueryClient()
  const { data } = useQuery<{ path: string | null }>({ queryKey: ['calendar-link'], queryFn: () => fetch('/api/calendar-link').then((r) => r.json()) })
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const rotate = useMutation({
    mutationFn: () => fetch('/api/calendar-link', { method: 'POST' }).then((r) => r.json()),
    onSuccess: (d) => { qc.setQueryData(['calendar-link'], d); setConfirm(false) },
  })
  const webcal = data?.path ? `webcal://${data.path}` : null
  const https = data?.path ? `https://${data.path}` : null

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><CalendarDays className="h-4 w-4 text-brand" /> Kalender-Abo</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Der Trainingsplan als ganztägige Termine in Apple Kalender: jede Einheit mit Ziel, Tempo und Ablauf. Änderungen im Plan
        (auch durch die Engine) erscheinen beim nächsten Abgleich des Kalenders. Der Link ist privat – nicht teilen.
      </p>
      {!webcal ? (
        <button onClick={() => rotate.mutate()} disabled={rotate.isPending} className="mt-4 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60">
          Kalender-Link erstellen
        </button>
      ) : (
        <div className="mt-4 grid gap-3">
          <a href={webcal} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white">
            <CalendarDays className="h-4 w-4" /> In Apple Kalender abonnieren
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-secondary px-2 py-1 text-xs">{https}</code>
            <button onClick={() => { navigator.clipboard.writeText(https!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /> {copied ? 'Kopiert' : 'Kopieren'}</button>
          </div>
          <p className="text-xs text-muted-foreground">
            Mac: Kalender → Ablage → Neues Kalenderabonnement → Link einfügen, „Aktualisieren: Jede Stunde“.
            iPhone: Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen.
          </p>
          <p className="text-xs text-muted-foreground">
            <b className="font-medium text-foreground">Änderungen kommen nicht an?</b> Runmate liefert jede Änderung sofort; Apple holt abonnierte
            Kalender aber nur nach eigenem Takt ab. Mac: Rechtsklick auf „Runmate Training“ → Informationen → Automatisch aktualisieren: alle 5 Minuten.
            iPhone: Einstellungen → Apps → Kalender → Accounts → Datenabgleich → alle 15 Minuten.
          </p>
          {confirm ? (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              Der alte Link hört auf zu funktionieren.
              <button onClick={() => rotate.mutate()} className="rounded bg-brand px-2 py-1 text-white">Neuen Link erstellen</button>
              <button onClick={() => setConfirm(false)} className="rounded border border-border px-2 py-1">Abbrechen</button>
            </span>
          ) : (
            <button onClick={() => setConfirm(true)} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-brand">
              <RefreshCw className="h-3.5 w-3.5" /> Link erneuern
            </button>
          )}
        </div>
      )}
    </div>
  )
}
