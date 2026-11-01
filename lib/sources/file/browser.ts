// The browser half of the file import: a Garmin data export is far larger than one request may be (Vercel: 4.5 MB),
// so the browser unpacks it (streaming, nested ZIPs included), keeps the activity files, gzips each one and sends them
// in batches below MAX_REQUEST_BYTES / MAX_FILES_PER_REQUEST. Uses fflate only; no server code.
import { gzipSync, Unzip, UnzipInflate, unzipSync } from 'fflate'
import { ACTIVITY_EXTENSIONS, MAX_FILE_BYTES, MAX_FILES_PER_REQUEST, MAX_REQUEST_BYTES } from './limits'

export interface Upload { name: string; bytes: Uint8Array }   // gzipped
export interface Rejected { name: string; message: string }

const ext = (name: string) => name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
const base = (name: string) => name.split('/').pop() || name
const isActivity = (name: string) => ACTIVITY_EXTENSIONS.includes(ext(name))

// Activity files inside a nested ZIP (the export's UploadedFiles_*.zip).
function fromInnerZip(bytes: Uint8Array, add: (name: string, b: Uint8Array) => void) {
  const files = unzipSync(bytes, { filter: (f) => isActivity(f.name) && f.originalSize <= MAX_FILE_BYTES })
  for (const [name, b] of Object.entries(files)) add(name, b)
}

// Streams one ZIP (any size the browser can read) and hands every activity file to `add`.
export async function readZip(file: Blob, add: (name: string, b: Uint8Array) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const pending: Promise<void>[] = []
    const uz = new Unzip((entry) => {
      const e = ext(entry.name)
      if (!isActivity(entry.name) && e !== '.zip') return
      const chunks: Uint8Array[] = []
      let size = 0
      pending.push(new Promise<void>((done) => {
        entry.ondata = (err, data, final) => {
          if (err) return done()
          size += data.length
          if (size <= (e === '.zip' ? Infinity : MAX_FILE_BYTES)) chunks.push(data)
          if (!final) return
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
          let o = 0
          for (const c of chunks) { all.set(c, o); o += c.length }
          try {
            if (e === '.zip') fromInnerZip(all, add)
            else if (size <= MAX_FILE_BYTES) add(entry.name, all)
          } catch { /* unreadable inner ZIP: skipped */ }
          done()
        }
        entry.start()
      }))
    })
    uz.register(UnzipInflate)
    const reader = file.stream().getReader()
    const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
      uz.push(value ?? new Uint8Array(0), done)
      return done ? undefined : pump()
    })
    pump().then(() => Promise.all(pending)).then(() => resolve(), reject)
  })
}

// Selected files (single activity files and/or ZIPs) → gzipped uploads, plus what cannot be sent.
export async function prepareUploads(files: File[]): Promise<{ uploads: Upload[]; rejected: Rejected[] }> {
  const uploads: Upload[] = []
  const rejected: Rejected[] = []
  const add = (name: string, bytes: Uint8Array) => {
    if (bytes.length > MAX_FILE_BYTES) { rejected.push({ name: base(name), message: 'Datei zu groß (höchstens 20 MB).' }); return }
    const gz = gzipSync(bytes, { level: 6 })
    if (gz.length > MAX_REQUEST_BYTES) { rejected.push({ name: base(name), message: 'Datei zu groß zum Hochladen (gepackt über 4 MB).' }); return }
    uploads.push({ name: `${base(name)}.gz`, bytes: gz })
  }
  for (const f of files) {
    const e = ext(f.name)
    if (e === '.zip') {
      try { await readZip(f, add) } catch { rejected.push({ name: f.name, message: 'ZIP konnte nicht gelesen werden.' }) }
    } else if (isActivity(f.name)) {
      if (f.size > MAX_FILE_BYTES) rejected.push({ name: f.name, message: 'Datei zu groß (höchstens 20 MB).' })
      else add(f.name, new Uint8Array(await f.arrayBuffer()))
    } else {
      rejected.push({ name: f.name, message: 'Nicht unterstützt (erlaubt: .fit, .gpx, .tcx, .zip).' })
    }
  }
  return { uploads, rejected }
}

// Batches below both request limits, in order. Pure.
export function batches<T extends { bytes: Uint8Array }>(items: T[], maxBytes = MAX_REQUEST_BYTES, maxFiles = MAX_FILES_PER_REQUEST): T[][] {
  const out: T[][] = []
  let cur: T[] = [], size = 0
  for (const it of items) {
    if (cur.length && (size + it.bytes.length > maxBytes || cur.length >= maxFiles)) { out.push(cur); cur = []; size = 0 }
    cur.push(it)
    size += it.bytes.length
  }
  if (cur.length) out.push(cur)
  return out
}
