// Uploaded files → stored activities for the current user: parse, skip sports Runmate does not track, deduplicate
// (same file again, or the same activity from any source: lib/sources/dedupe.ts), store streams and run metrics
// (a file whose detail failed to store earlier is completed when it is imported again).
import { loadPlan } from '@/lib/plan/load'
import { storeDetail, upsertSummary } from '@/lib/sources/ingest'
import { isImportedSport } from '@/lib/sources/sports'
import { SourceError } from '@/lib/sources/types'
import { fileSource } from './index'

export interface ImportReport {
  files: number
  inserted: number
  replaced: number                   // the same activity from another source, now replaced by the richer file
  duplicates: number
  repaired: number                   // the same file again, stored earlier without its detail data: now completed
  skipped: number                    // sports Runmate does not track (e.g. walking)
  // Unreadable files, activities with impossible values (not stored), and activities stored without detail data.
  errors: { name: string; message: string }[]
}

const base = (name: string) => name.split(/[\\/]/).pop() ?? name
const deDate = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`

export async function importFiles(files: { name: string; bytes: Uint8Array }[]): Promise<ImportReport> {
  const report: ImportReport = { files: files.length, inserted: 0, replaced: 0, duplicates: 0, repaired: 0, skipped: 0, errors: [] }
  const plan = await loadPlan()
  for (const f of files) {
    try {
      const parsed = await fileSource.parseFile(f.name, f.bytes)
      if (!parsed.length) report.errors.push({ name: f.name, message: 'Keine Aktivität in der Datei gefunden.' })
      for (const { summary, detail } of parsed) {
        if (!isImportedSport(summary.sport)) { report.skipped++; continue }
        const r = await upsertSummary('file', summary, { existing: 'skip', detail })
        if (r.result === 'rejected') {
          report.errors.push({ name: base(f.name), message: `${base(f.name)}: Aktivität vom ${deDate(summary.startLocal)} nicht importiert – ${r.reason.message}.` })
          continue
        }
        if (r.result === 'duplicate' && !r.incomplete) { report.duplicates++; continue }
        // The row is stored from here on and counts whatever happens next. Row and detail cannot be written in one
        // transaction (ingest.ts storeDetail), so when the detail fails the report says exactly that, and importing
        // the file again completes the row (`incomplete`) instead of counting a duplicate.
        const detailed = await storeDetail(r.id, detail, plan).then(() => true, (err) => {
          console.error('[import] detail', f.name.slice(-80), (err as Error)?.message)
          return false
        })
        if (r.result !== 'duplicate') report[r.result === 'replaced' ? 'replaced' : 'inserted']++
        else if (detailed) report.repaired++
        if (!detailed) report.errors.push({ name: base(f.name), message: `${base(f.name)}: Aktivität vom ${deDate(summary.startLocal)} gespeichert, aber ohne Detaildaten (Splits, Verlauf). Bitte die Datei erneut importieren.` })
      }
    } catch (err) {
      const message = err instanceof SourceError ? err.message : 'Datei konnte nicht importiert werden.'
      if (!(err instanceof SourceError)) console.error('[import]', f.name.slice(-80), (err as Error)?.message)
      report.errors.push({ name: base(f.name), message })
    }
  }
  return report
}
