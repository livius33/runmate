// Source `file`: activities from uploaded .FIT, .GPX, .TCX files and Garmin data-export ZIPs (also gzipped, as the
// browser sends them; components/settings/ImportCard.tsx). Nothing to connect; account-free.
import { createHash } from 'crypto'
import { gunzipSync, unzipSync } from 'fflate'
import { timeZone } from '@/lib/dates'
import { SourceError, type ParsedActivity, type UploadSource } from '@/lib/sources/types'
import { parseFit } from './fit'
import { parseGpx, parseTcx } from './xml'

import { ACTIVITY_EXTENSIONS, MAX_FILE_BYTES, MAX_ZIP_ENTRIES } from './limits'

export * from './limits'

const ext = (name: string) => (name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '')
const base = (name: string) => name.split(/[\\/]/).pop() || name
const tooBig = (name: string) => new SourceError('invalid', `${base(name)}: Datei zu groß (höchstens 20 MB).`)

// gzip stores the uncompressed size (mod 2^32) in its last four bytes: checked before inflating.
function gunzipChecked(name: string, bytes: Uint8Array): Uint8Array {
  const n = bytes.length
  const size = n >= 4 ? (bytes[n - 4] | (bytes[n - 3] << 8) | (bytes[n - 2] << 16) | (bytes[n - 1] << 24)) >>> 0 : 0
  if (size > MAX_FILE_BYTES) throw tooBig(name)
  try { return gunzipSync(bytes) } catch { throw new SourceError('invalid', `${base(name)}: konnte nicht entpackt werden.`) }
}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b

async function parse(name: string, bytes: Uint8Array, depth: number): Promise<ParsedActivity[]> {
  if (bytes.length > MAX_FILE_BYTES) throw tooBig(name)
  if (name.toLowerCase().endsWith('.gz') || isGzip(bytes)) {
    return parse(name.replace(/\.gz$/i, ''), gunzipChecked(name, bytes), depth)
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
    return (await Promise.all(unzipEntries(name, bytes).map(([n, b]) => parse(n, b, depth + 1).catch(() => [] as ParsedActivity[])))).flat()
  }
  throw new SourceError('invalid', `${base(name)}: nicht unterstützt (erlaubt: .fit, .gpx, .tcx, .zip).`)
}

// Activity files (and nested ZIPs, as in Garmin's export) of a ZIP; the rest of the export is ignored.
export function unzipEntries(name: string, bytes: Uint8Array): [string, Uint8Array][] {
  let count = 0
  try {
    const files = unzipSync(bytes, {
      filter: (f) => {
        const e = ext(f.name.replace(/\.gz$/i, ''))
        const wanted = (ACTIVITY_EXTENSIONS.includes(e) || e === '.zip') && f.originalSize <= MAX_FILE_BYTES * (e === '.zip' ? 50 : 1)
        if (wanted && ++count > MAX_ZIP_ENTRIES) throw new SourceError('invalid', `${base(name)}: mehr als ${MAX_ZIP_ENTRIES} Dateien.`)
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
