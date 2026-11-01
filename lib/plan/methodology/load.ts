// Reads methodology templates from methodologies/*.md (server only — uses fs; never import from client components).
// parseMethodology() is pure: frontmatter → schema → safety limits, with German messages per field.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { ZodIssue } from 'zod'
import { MethodologySchema, type Methodology } from './schema'
import { checkSafety } from './safety'

export interface MethodologyFile { id: string; meta: Pick<Methodology, 'id' | 'name' | 'summary' | 'distances' | 'sources'>; params: Methodology; bodyMarkdown: string }
export interface MethodologyError { file: string; errors: string[] }
export type ParseResult = { ok: true; value: MethodologyFile } | { ok: false; errors: string[] }

const DIR = path.join(process.cwd(), 'methodologies')
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function german(issue: ZodIssue): string {
  const where = issue.path.join('.') || '(Datei)'
  switch (issue.code) {
    case 'unrecognized_keys': return `${where}: unbekanntes Feld ${issue.keys.map((k) => `„${k}“`).join(', ')} (Tippfehler?)`
    case 'invalid_type': return issue.received === 'undefined' ? `${where}: fehlt` : `${where}: erwartet ${issue.expected}, gefunden ${issue.received}`
    case 'invalid_enum_value': return `${where}: „${String(issue.received)}“ ist nicht erlaubt (erlaubt: ${issue.options.join(', ')})`
    case 'too_small': return `${where}: kleiner als ${String(issue.minimum)}`
    case 'too_big': return `${where}: größer als ${String(issue.maximum)}`
    default: return `${where}: ${issue.message}`
  }
}

export function parseMethodology(text: string, file = '(Text)'): ParseResult {
  const m = text.match(FRONTMATTER)
  if (!m) return { ok: false, errors: [`${file}: kein YAML-Kopf zwischen --- und ---`] }
  let raw: unknown
  try { raw = parseYaml(m[1]) } catch (e) { return { ok: false, errors: [`YAML: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`] } }
  const parsed = MethodologySchema.safeParse(raw)
  const issues = checkSafety(raw)
  const safety = issues.map((s) => `${s.path}: ${s.message}`)
  // A field over a safety limit is reported once, with the limit (not also as a schema range error).
  const format = parsed.success ? [] : parsed.error.issues.filter((i) => !issues.some((s) => s.path === i.path.join('.'))).map(german)
  if (!parsed.success || safety.length) return { ok: false, errors: [...format, ...safety] }
  const p = parsed.data
  const expected = path.basename(file, '.md')
  if (file !== '(Text)' && p.id !== expected) return { ok: false, errors: [`id: „${p.id}“ passt nicht zum Dateinamen „${expected}“`] }
  return { ok: true, value: { id: p.id, meta: { id: p.id, name: p.name, summary: p.summary, distances: p.distances, sources: p.sources }, params: p, bodyMarkdown: m[2].trim() } }
}

let cache: { valid: MethodologyFile[]; invalid: MethodologyError[] } | null = null

// All templates; an invalid file is reported, never breaks the others.
export function listMethodologies(dir = DIR) {
  if (cache && dir === DIR) return cache
  const valid: MethodologyFile[] = []
  const invalid: MethodologyError[] = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && x !== 'README.md').sort()) {
    const r = parseMethodology(readFileSync(path.join(dir, f), 'utf8'), f)
    if (r.ok) valid.push(r.value)
    else invalid.push({ file: f, errors: r.errors })
  }
  const out = { valid, invalid }
  if (dir === DIR) cache = out
  return out
}

// The neutral bases of the own method (07-19), one per distance; not book templates, so not in listMethodologies().
const OWN_DIR = path.join(DIR, 'own')
let ownCache: { valid: MethodologyFile[]; invalid: MethodologyError[] } | null = null
export function listOwnBases(dir = OWN_DIR) {
  if (ownCache && dir === OWN_DIR) return ownCache
  const out = listMethodologies(dir)
  if (dir === OWN_DIR) ownCache = out
  return out
}

export function loadMethodology(id: string): MethodologyFile | null {
  return listMethodologies().valid.find((m) => m.id === id) ?? null
}
