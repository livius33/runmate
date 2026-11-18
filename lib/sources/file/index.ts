// Source `file`: activities from uploaded .FIT, .GPX, .TCX files and Garmin data-export ZIPs (also gzipped, as the
// browser sends them; components/settings/ImportCard.tsx). Nothing to connect; account-free.
import { createHash } from 'crypto'
import { Gunzip, unzipSync } from 'fflate'
import { timeZone } from '@/lib/dates'
import { SourceError, type ParsedActivity, type UploadSource } from '@/lib/sources/types'
import { parseFit } from './fit'
import { parseGpx, parseTcx } from './xml'

import { ACTIVITY_EXTENSIONS, MAX_FILE_BYTES, MAX_UNPACKED_BYTES, MAX_ZIP_ENTRIES } from './limits'

export * from './limits'

const ext = (name: string) => (name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '')
const base = (name: string) => name.split(/[\\/]/).pop() || name
const tooBig = (name: string) => new SourceError('invalid', `${base(name)}: Datei zu groß (höchstens 20 MB).`)
const damaged = (name: string) => new SourceError('invalid', `${base(name)}: Datei ist beschädigt oder unvollständig.`)

// What one upload may still inflate to. Shared by every .gz and ZIP inside it: many entries that each stay within the
// per-file limit must not add up (a 1 MB ZIP of sixty 20 MB files took 1.2 GB of memory).
interface Budget { left: number }
const overBudget = (name: string) => new SourceError('invalid', `${base(name)}: entpackt zu groß (höchstens ${MAX_UNPACKED_BYTES / 1024 / 1024} MB).`)
function spend(budget: Budget, name: string, size: number) {
  budget.left -= size
  if (budget.left < 0) throw overBudget(name)
}

// A .gz is inflated in slices and given up as soon as more came out than one file or the budget allows. gzip stores
// the uncompressed size (mod 2^32) in its last four bytes, but that number cannot decide "too big" beforehand: an
// upload cut off in transit ends in compressed data, which read as a size says "over 20 MB" nearly every time. It is
// compared afterwards instead: a file that ends early, or whose stored size is not what came out, is damaged.
// Whatever was inflated counts against the budget, rejected or not, so a ZIP of oversized entries cannot keep the
// server inflating.
const GZIP_SLICE = 16 * 1024   // deflate expands at most 1032-fold: one slice is under 17 MB of output
function gunzipChecked(name: string, bytes: Uint8Array, budget: Budget): Uint8Array {
  const n = bytes.length, limit = Math.min(MAX_FILE_BYTES, budget.left)
  const chunks: Uint8Array[] = []
  let size = 0, complete = n >= 18   // header and trailer alone take 18 bytes
  try {
    const gz = new Gunzip((chunk) => { chunks.push(chunk); size += chunk.length })
    for (let i = 0; complete && i < n && size <= limit; i += GZIP_SLICE) gz.push(bytes.subarray(i, i + GZIP_SLICE), i + GZIP_SLICE >= n)
  } catch { complete = false }
  spend(budget, name, size)
  if (size > MAX_FILE_BYTES) throw tooBig(name)
  const stored = complete ? (bytes[n - 4] | (bytes[n - 3] << 8) | (bytes[n - 2] << 16) | (bytes[n - 1] << 24)) >>> 0 : -1
  if (stored !== size) throw damaged(name)
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b

async function parse(name: string, bytes: Uint8Array, depth: number, budget: Budget = { left: MAX_UNPACKED_BYTES }): Promise<ParsedActivity[]> {
  if (bytes.length > MAX_FILE_BYTES) throw tooBig(name)
  if (name.toLowerCase().endsWith('.gz') || isGzip(bytes)) {
    return parse(name.replace(/\.gz$/i, ''), gunzipChecked(name, bytes, budget), depth, budget)
  }
  const e = ext(name)
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  const zone = timeZone()
  try {
    if (e === '.fit') return await parseFit(bytes, id, zone)
    if (e === '.gpx') return parseGpx(new TextDecoder().decode(bytes), id, zone)
    if (e === '.tcx') return parseTcx(new TextDecoder().decode(bytes).trimStart(), id, zone)
  } catch (err) {
    if (err instanceof SourceError) throw new SourceError('invalid', `${base(name)}: ${err.message}`)
    throw new SourceError('invalid', `${base(name)}: Datei konnte nicht gelesen werden.`)
  }
  if (e === '.zip') {
    if (depth > 1) return []
    // An unreadable entry is skipped; a spent budget fails the whole upload.
    const skip = () => { if (budget.left < 0) throw overBudget(name); return [] as ParsedActivity[] }
    return (await Promise.all(unzipEntries(name, bytes, budget).map(([n, b]) => parse(n, b, depth + 1, budget).catch(skip)))).flat()
  }
  throw new SourceError('invalid', `${base(name)}: nicht unterstützt (erlaubt: .fit, .gpx, .tcx, .zip).`)
}

// Activity files (and nested ZIPs, as in Garmin's export) of a ZIP; the rest of the export is ignored.
export function unzipEntries(name: string, bytes: Uint8Array, budget: Budget = { left: MAX_UNPACKED_BYTES }): [string, Uint8Array][] {
  let count = 0
  try {
    const files = unzipSync(bytes, {
      filter: (f) => {
        const e = ext(f.name.replace(/\.gz$/i, ''))
        const wanted = (ACTIVITY_EXTENSIONS.includes(e) || e === '.zip') && f.originalSize <= MAX_FILE_BYTES * (e === '.zip' ? 50 : 1)
        if (wanted && ++count > MAX_ZIP_ENTRIES) throw new SourceError('invalid', `${base(name)}: mehr als ${MAX_ZIP_ENTRIES} Dateien.`)
        if (wanted) spend(budget, name, f.originalSize)
        return wanted
      },
    })
    return Object.entries(files)
  } catch (err) {
    if (err instanceof SourceError) throw err
    throw new SourceError('invalid', `${base(name)}: ZIP konnte nicht gelesen werden.`)
  }
}

export const fileSource: UploadSource = {
  meta: {
    id: 'file',
    label: 'Datei-Import',
    description: '.FIT, .GPX, .TCX oder der Garmin-Datenexport (.ZIP). Doppelte Aktivitäten werden übersprungen.',
    auth: 'upload',
    available: true,
    capabilities: { activities: true, detailStreams: true, dailyWellness: false, mode: 'upload', history: true, runs: true },
  },
  async status() { return { connected: true, lastSyncAt: null, error: null } },
  async disconnect() { /* nothing stored besides the imported activities */ },
  parseFile: (name, bytes) => parse(name, bytes, 0),
}
