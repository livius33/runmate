import { NextResponse } from 'next/server'
import { importFiles } from '@/lib/sources/file/import'
import { MAX_FILE_BYTES, MAX_FILES_PER_REQUEST, MAX_IMPORT_BODY_BYTES } from '@/lib/sources/file'
import { readForm, tooLargeResponse } from '@/lib/server/body'
import { runAndSaveEngine } from '@/lib/plan/engine-store'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'
export const maxDuration = 60

// Per request (Vercel caps the body at 4.5 MB): the browser unpacks ZIPs and sends gzipped activity files in batches
// (components/settings/ImportCard.tsx). Plain .fit/.gpx/.tcx/.zip files work too (self-host, curl).
// multipart/form-data, field `file` (repeated) → import report. `?final=1` on the last batch adapts the plan once.
export const POST = withUser(async (req: Request) => {
  const blocked = await intakeBlocked()
  if (blocked) return blocked
  const read = await readForm(req, MAX_IMPORT_BODY_BYTES)
  if (!read.ok) return tooLargeResponse(MAX_IMPORT_BODY_BYTES)
  const form = read.value
  if (!form) return NextResponse.json({ error: 'Dateien als multipart/form-data im Feld „file“ senden.' }, { status: 400 })
  const entries = form.getAll('file').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f)
  if (!entries.length) return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 })
  if (entries.length > MAX_FILES_PER_REQUEST) return NextResponse.json({ error: `Höchstens ${MAX_FILES_PER_REQUEST} Dateien pro Anfrage.` }, { status: 400 })
  const files: { name: string; bytes: Uint8Array }[] = []
  const tooBig: { name: string; message: string }[] = []
  for (const f of entries) {
    if (f.size > MAX_FILE_BYTES) tooBig.push({ name: f.name, message: `${f.name}: Datei zu groß (höchstens 20 MB).` })
    else files.push({ name: f.name || 'upload', bytes: new Uint8Array(await f.arrayBuffer()) })
  }
  await ensureLiveBlocks()
  const report = await importFiles(files)
  report.files += tooBig.length
  report.errors.push(...tooBig)
  // Every stored change feeds the engine: a new run, a run replaced by the richer file (other distance, pace, heart
  // rate) and a run that only now got its detail data.
  if (new URL(req.url).searchParams.get('final') === '1' && report.inserted + report.replaced + report.repaired > 0) {
    await runAndSaveEngine().catch((err) => console.error('[import] plan engine failed:', err?.message))
  }
  return NextResponse.json({ ok: true, ...report })
})
