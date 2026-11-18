// Uploaded files → stored activities for the current user: parse, skip sports Runmate does not track, deduplicate
// (same file again, or the same activity from any source: lib/sources/dedupe.ts), store streams and run metrics.
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
  skipped: number                    // sports Runmate does not track (e.g. walking)
  errors: { name: string; message: string }[]   // unreadable files, and activities with impossible values (not stored)
}

const base = (name: string) => name.split(/[\\/]/).pop() ?? name
const deDate = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`

export async function importFiles(files: { name: string; bytes: Uint8Array }[]): Promise<ImportReport> {
  const report: ImportReport = { files: files.length, inserted: 0, replaced: 0, duplicates: 0, skipped: 0, errors: [] }
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
        if (r.result === 'duplicate') { report.duplicates++; continue }
        await storeDetail(r.id, detail, plan)
        report[r.result === 'replaced' ? 'replaced' : 'inserted']++
      }
    } catch (err) {
      const message = err instanceof SourceError ? err.message : 'Datei konnte nicht importiert werden.'
      if (!(err instanceof SourceError)) console.error('[import]', f.name.slice(-80), (err as Error)?.message)
      report.errors.push({ name: base(f.name), message })
    }
  }
  return report
}
