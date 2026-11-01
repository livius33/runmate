// Static scoping check (Phase 2): finds every drizzle query chain in the source and reports the ones on a user table
// that do not filter by the owner. Text-based on purpose: no TS compiler needed, fast, and strict about the patterns
// lib/db/owned.ts offers (own(...), mine(...), or an explicit eq(<table>.userId, …)).
export interface Finding { file: string; line: number; op: string; table: string; text: string }

const START = /\bdb\s*\.\s*(select|selectDistinct|insert|update|delete|execute)\b/g

// From `start`, the end of the method chain: balanced brackets, continuing over `.` on the next line.
function chainEnd(src: string, start: number): number {
  let depth = 0
  let i = start
  let quote: string | null = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return i; depth-- }
    else if (depth === 0 && (c === ',' || c === ';')) return i
    else if (depth === 0 && c === '\n') {
      const rest = src.slice(i + 1).match(/^\s*(\S)/)
      if (!rest || rest[1] !== '.') return i
    }
  }
  return i
}

export function scanSource(file: string, src: string, userTables: Set<string>): Finding[] {
  const out: Finding[] = []
  for (const m of src.matchAll(START)) {
    const start = m.index!
    const text = src.slice(start, chainEnd(src, start))
    const op = m[1]
    const line = src.slice(0, start).split('\n').length
    const prev = src.split('\n').slice(Math.max(0, line - 2), line - 1).join('\n')
    if (/\/\/ cross-user:/.test(prev)) continue
    if (op === 'execute') { out.push({ file, line, op, table: '(raw SQL)', text }); continue }
    const table = (op === 'select' || op === 'selectDistinct' ? text.match(/\.from\(\s*(\w+)/) : text.match(/^db\s*\.\s*\w+\(\s*(\w+)/))?.[1]
    if (!table || !userTables.has(table)) continue
    const scoped = op === 'insert' ? /\bmine\b|\buserId\b/.test(text) : /\bown\(|\.userId\s*,/.test(text)
    if (!scoped) out.push({ file, line, op, table, text: text.replace(/\s+/g, ' ').slice(0, 160) })
  }
  return out
}
