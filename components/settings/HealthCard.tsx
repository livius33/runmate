'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, HeartPulse, RefreshCw } from 'lucide-react'

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
export function HealthCard() {
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
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><HeartPulse className="h-4 w-4 text-brand" /> Apple Health</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Ein Kurzbefehl auf dem iPhone schickt jeden Abend Schlaf, Ruhepuls, HRV, Schritte, aktive Energie und Gewicht an Runmate.
        Läufe kommen weiter nur von Garmin. Der Link ist privat – nicht teilen.
      </p>
      <p className="mt-2 text-sm">
        Letzte Übertragung: {last ? <b className="font-medium">{new Date(last.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })} · {last.values} Werte für {last.date.split('-').reverse().join('.')}</b> : <span className="text-muted-foreground">noch keine</span>}
      </p>
      {!data?.url ? (
        <button onClick={() => rotate.mutate()} disabled={rotate.isPending} className="mt-4 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60">
          Upload-Link erstellen
        </button>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-secondary px-2 py-1 text-xs">{data.url}</code>
            <button onClick={() => navigator.clipboard.writeText(data.url!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
              className="tap inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /> {copied ? 'Kopiert' : 'Kopieren'}</button>
          </div>
          <details className="rounded-lg border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Kurzbefehl einrichten (ca. 5 Minuten)</summary>
            <ol className="mt-3 grid list-decimal gap-2 pl-5 text-muted-foreground">
              <li>App <b className="text-foreground">Kurzbefehle</b> → <b className="text-foreground">+</b> → Name „Runmate Health“.</li>
              <li>Für jeden Wert die Aktion <b className="text-foreground">Health-Beispiele suchen</b> hinzufügen: Typ wählen (z. B. Schritte), Filter <i>Startdatum ist heute</i>.
                Danach <b className="text-foreground">Statistik berechnen</b> (Summe bei Schritten/Energie, Durchschnitt bei HRV) bzw. beim Ruhepuls/Gewicht <i>Sortieren: neueste zuerst, Limit 1</i>.</li>
              <li>Schlaf: Health-Beispiele „Schlafanalyse“ mit Startdatum <i>in den letzten 1 Tagen</i>, Wert „Dauer“ summieren und in Stunden umrechnen.</li>
              <li>Aktion <b className="text-foreground">Wörterbuch</b> mit diesen Schlüsseln (Werte = die Ergebnisse oben; fehlende einfach weglassen):
                <ul className="mt-1 grid gap-0.5">{FIELDS.map(([k, v]) => <li key={k}><code className="text-foreground">{k}</code> – {v}</li>)}</ul>
              </li>
              <li>Aktion <b className="text-foreground">Inhalte von URL abrufen</b>: URL = der Link oben, Methode <b className="text-foreground">POST</b>, Anfragetext <b className="text-foreground">JSON</b> = das Wörterbuch.</li>
              <li>Einmal ▶︎ antippen: oben erscheint „Letzte Übertragung“. Antwort mit Fehler? Sie nennt das Feld, das nicht passt.</li>
              <li>Tab <b className="text-foreground">Automation</b> → <b className="text-foreground">Tageszeit</b> 23:30, täglich → Kurzbefehl „Runmate Health“ → <b className="text-foreground">Sofort ausführen</b> (ohne Bestätigung).</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Die Aktionsnamen können je nach iOS-Version leicht abweichen. Workouts der Apple Watch (z. B. Krafttraining) kann der Kurzbefehl optional als
              Liste <code>workouts</code> mit type, start, minutes, kcal, avgHr mitschicken; Läufe werden dabei ignoriert.
            </p>
          </details>
          {confirm ? (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              Der alte Link hört auf zu funktionieren (Kurzbefehl anpassen).
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
