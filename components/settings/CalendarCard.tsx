'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Copy, RefreshCw } from 'lucide-react'
import { Button, Card } from '@/components/ui'

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
    <Card title={<span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-brand" /> Kalender-Abo</span>}>
      <p className="text-body-sm text-muted-foreground">
        Der Trainingsplan als ganztägige Termine in Apple Kalender: jede Einheit mit Ziel, Tempo und Ablauf. Änderungen im Plan
        (auch durch die Engine) erscheinen beim nächsten Abgleich des Kalenders. Der Link ist privat – nicht teilen.
      </p>
      {!webcal ? (
        <Button size="action" className="mt-4" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
          Kalender-Link erstellen
        </Button>
      ) : (
        <div className="mt-4 grid gap-3">
          <Button asChild size="action" className="w-fit">
            <a href={webcal}><CalendarDays /> In Apple Kalender abonnieren</a>
          </Button>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full truncate rounded-control bg-secondary px-2 py-1 text-caption">{https}</code>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(https!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}>
              <Copy /> {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            Mac: Kalender → Ablage → Neues Kalenderabonnement → Link einfügen, „Aktualisieren: Jede Stunde“.
            iPhone: Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen.
          </p>
          <p className="text-caption text-muted-foreground">
            <b className="font-medium text-foreground">Änderungen kommen nicht an?</b> Runmate liefert jede Änderung sofort; Apple holt abonnierte
            Kalender aber nur nach eigenem Takt ab. Mac: Rechtsklick auf „Runmate Training“ → Informationen → Automatisch aktualisieren: alle 5 Minuten.
            iPhone: Einstellungen → Apps → Kalender → Accounts → Datenabgleich → alle 15 Minuten.
          </p>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 text-caption">
              Der alte Link hört auf zu funktionieren.
              <Button variant="destructive" size="sm" onClick={() => rotate.mutate()}>Neuen Link erstellen</Button>
              <Button size="sm" onClick={() => setConfirm(false)}>Abbrechen</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="-ml-2.5 w-fit" onClick={() => setConfirm(true)}>
              <RefreshCw /> Link erneuern
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
