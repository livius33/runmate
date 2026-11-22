'use client'

// File import: .FIT / .GPX / .TCX files or the Garmin data export (.ZIP). The browser unpacks and batches
// (lib/sources/file/browser.ts), so a multi-GB export goes up in small requests; duplicates are skipped on the server.
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { batches, prepareUploads, type Rejected } from '@/lib/sources/file/browser'
import { Button, Card, SectionHeader } from '@/components/ui'
import { AFTER_SYNC } from './GarminSource'

interface Totals { inserted: number; replaced: number; repaired: number; duplicates: number; skipped: number; errors: Rejected[] }

export function ImportCard() {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [totals, setTotals] = useState<Totals | null>(null)

  async function run(files: File[]) {
    setBusy(true)
    setTotals(null)
    const t: Totals = { inserted: 0, replaced: 0, repaired: 0, duplicates: 0, skipped: 0, errors: [] }
    try {
      setProgress('Dateien werden gelesen…')
      const { uploads, rejected } = await prepareUploads(files)
      t.errors.push(...rejected)
      const parts = batches(uploads)
      let sent = 0
      for (const [i, part] of parts.entries()) {
        setProgress(`Hochladen: ${sent} von ${uploads.length} Dateien · ${t.inserted} neu · ${t.duplicates} doppelt`)
        const form = new FormData()
        for (const u of part) form.append('file', new Blob([u.bytes as BlobPart], { type: 'application/gzip' }), u.name)
        const r = await fetch(`/api/import${i === parts.length - 1 ? '?final=1' : ''}`, { method: 'POST', body: form })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { t.errors.push({ name: `Teil ${i + 1}`, message: d.error ?? 'Hochladen fehlgeschlagen' }); continue }
        t.inserted += d.inserted
        t.replaced += d.replaced ?? 0
        t.repaired += d.repaired ?? 0
        t.duplicates += d.duplicates
        t.skipped += d.skipped
        t.errors.push(...(d.errors ?? []))
        sent += part.length
      }
      setProgress(uploads.length ? `Fertig: ${uploads.length} Dateien verarbeitet.` : null)
    } catch {
      t.errors.push({ name: 'Import', message: 'Import abgebrochen. Bitte erneut versuchen.' })
    } finally {
      setTotals(t)
      setBusy(false)
      for (const key of AFTER_SYNC) qc.invalidateQueries({ queryKey: [key] })
    }
  }

  return (
    <Card stack>
      <SectionHeader as="h3" title={<span className="flex items-center gap-2"><Upload className="h-4 w-4 shrink-0 text-brand" /> Datei-Import</span>} />
      <p className="text-body-sm text-muted-foreground">
        .FIT, .GPX oder .TCX-Dateien (je höchstens 20 MB) – oder den kompletten Garmin-Datenexport als .ZIP
        (Garmin-Konto → Datenverwaltung → Daten exportieren). Aktivitäten, die schon da sind (gleicher Start ±2 Minuten,
        Distanz ±3 %), werden übersprungen, egal aus welcher Quelle – außer die Datei ist reicher (z. B. mit Puls- und
        GPS-Verlauf statt nur einer Zusammenfassung): dann ersetzt sie den vorhandenen Eintrag, deine RPE und
        Rückmeldungen bleiben.
      </p>
      <input ref={input} type="file" multiple accept=".fit,.gpx,.tcx,.zip" className="hidden"
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) run(files) }} />
      <Button size="action" className="w-fit" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'Importiere…' : 'Dateien wählen'}
      </Button>
      {progress && <p className="text-caption tabular-nums text-muted-foreground">{progress}</p>}
      {totals && (
        <div className="grid gap-1 text-caption">
          <p className="tabular-nums">{totals.inserted} neu{totals.replaced > 0 && ` · ${totals.replaced} ersetzt`}{totals.repaired > 0 && ` · ${totals.repaired} vervollständigt`} · {totals.duplicates} schon vorhanden · {totals.skipped} andere Sportarten übersprungen</p>
          {totals.errors.length > 0 && (
            <details className="text-error">
              <summary className="cursor-pointer">{totals.errors.length} {totals.errors.length === 1 ? 'Datei' : 'Dateien'} nicht oder nicht vollständig importiert</summary>
              <ul className="mt-1 grid gap-0.5">{totals.errors.slice(0, 50).map((e, i) => <li key={i}>{e.message.startsWith(e.name) ? e.message : `${e.name}: ${e.message}`}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Card>
  )
}
