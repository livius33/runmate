'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, HeartPulse, RefreshCw } from 'lucide-react'
import { timeZone } from '@/lib/dates'
import { Button, Card } from '@/components/ui'

type Link = { url: string | null; last: { at: string; date: string; values: number } | null }

const FIELDS: [string, string][] = [
  ['date', 'Datum, Format JJJJ-MM-TT (z. B. „Aktuelles Datum“ formatiert als yyyy-MM-dd)'],
  ['steps', 'Schritte (Summe)'],
  ['activeKcal', 'Aktive Energie (Summe, kcal)'],
  ['sleepHours', 'Schlaf in Stunden (oder sleepMin in Minuten)'],
  ['restingHr', 'Ruhepuls (letzter Wert)'],
  ['hrvMs', 'Herzfrequenzvariabilität (Durchschnitt, ms)'],
  ['weightKg', 'Gewicht (letzter Wert, kg)'],
]

// Apple Health via an iOS Shortcut: private upload link, step-by-step guide, last upload.
export function HealthCard({ otherRunSource }: { otherRunSource: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery<Link>({ queryKey: ['health-link'], queryFn: () => fetch('/api/health-link').then((r) => r.json()) })
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const rotate = useMutation({
    mutationFn: () => fetch('/api/health-link', { method: 'POST' }).then((r) => r.json()),
    onSuccess: (d) => { qc.setQueryData(['health-link'], d); setConfirm(false) },
  })
  const last = data?.last
  return (
    <Card title={<span className="flex items-center gap-2"><HeartPulse className="h-4 w-4 shrink-0 text-brand" /> Apple Health</span>}>
      <p className="text-body-sm text-muted-foreground">
        Ein Kurzbefehl auf dem iPhone schickt jeden Abend Schlaf, Ruhepuls, HRV, Schritte, aktive Energie und Gewicht an Runmate.
        {otherRunSource
          ? ' Läufe kommen von deiner anderen Quelle; Lauf-Workouts aus Apple Health werden ignoriert, damit nichts doppelt zählt.'
          : ' Ohne andere Laufquelle übernimmt Runmate Lauf-Workouts aus Apple Health (mit Distanz) als Läufe.'}
        {' '}Der Link ist privat – nicht teilen.
      </p>
      <p className="mt-2 text-body-sm">
        Letzte Übertragung: {last ? <b className="font-medium tabular-nums">{new Date(last.at).toLocaleString('de-DE', { timeZone: timeZone(), day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} · {last.values} Werte für {last.date.split('-').reverse().join('.')}</b> : <span className="text-muted-foreground">noch keine</span>}
      </p>
      {!data?.url ? (
        <Button size="action" className="mt-4" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
          Upload-Link erstellen
        </Button>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full truncate rounded-control bg-secondary px-2 py-1 text-caption">{data.url}</code>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(data.url!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>
              <Copy /> {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
          <details className="rounded-card p-3 text-body-sm shadow-hairline">
            <summary className="cursor-pointer font-medium">Kurzbefehl einrichten (ca. 5 Minuten)</summary>
            <ol className="mt-3 grid list-decimal gap-2 pl-5 text-muted-foreground">
              <li>App <b className="font-medium text-foreground">Kurzbefehle</b> → <b className="font-medium text-foreground">+</b> → Name „Runmate Health“.</li>
              <li>Für jeden Wert die Aktion <b className="font-medium text-foreground">Health-Beispiele suchen</b> hinzufügen: Typ wählen (z. B. Schritte), Filter <i>Startdatum ist heute</i>.
                Danach <b className="font-medium text-foreground">Statistik berechnen</b> (Summe bei Schritten/Energie, Durchschnitt bei HRV) bzw. beim Ruhepuls/Gewicht <i>Sortieren: neueste zuerst, Limit 1</i>.</li>
              <li>Schlaf: Health-Beispiele „Schlafanalyse“ mit Startdatum <i>in den letzten 1 Tagen</i>, Wert „Dauer“ summieren und in Stunden umrechnen.</li>
              <li>Aktion <b className="font-medium text-foreground">Wörterbuch</b> mit diesen Schlüsseln (Werte = die Ergebnisse oben; fehlende einfach weglassen):
                <ul className="mt-1 grid gap-0.5">{FIELDS.map(([k, v]) => <li key={k}><code className="text-foreground">{k}</code> – {v}</li>)}</ul>
              </li>
              <li>Aktion <b className="font-medium text-foreground">Inhalte von URL abrufen</b>: URL = der Link oben, Methode <b className="font-medium text-foreground">POST</b>, Anfragetext <b className="font-medium text-foreground">JSON</b> = das Wörterbuch.</li>
              <li>Einmal ▶︎ antippen: oben erscheint „Letzte Übertragung“. Antwort mit Fehler? Sie nennt das Feld, das nicht passt.</li>
              <li>Tab <b className="font-medium text-foreground">Automation</b> → <b className="font-medium text-foreground">Tageszeit</b> 23:30, täglich → Kurzbefehl „Runmate Health“ → <b className="font-medium text-foreground">Sofort ausführen</b> (ohne Bestätigung).</li>
            </ol>
            <p className="mt-2 text-caption text-muted-foreground">
              Die Aktionsnamen können je nach iOS-Version leicht abweichen. Workouts der Apple Watch (z. B. Krafttraining) kann der Kurzbefehl optional als
              Liste <code>workouts</code> mit type, start, minutes, kcal, avgHr mitschicken.
              {otherRunSource
                ? ' Läufe darin werden ignoriert, solange eine andere Laufquelle verbunden ist.'
                : <> Für Läufe zusätzlich <code>distanceKm</code> angeben; doppelte Läufe (gleicher Start ±2 Minuten, Distanz ±3 %) werden erkannt.</>}
            </p>
          </details>
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2 text-caption">
              Der alte Link hört auf zu funktionieren (Kurzbefehl anpassen).
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
