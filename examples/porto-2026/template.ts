// The methodology template that reproduces the example block (runmate-porto-2026.md in this folder). It is not in
// methodologies/, so the app never offers it; tests and scripts load it from here.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseMethodology, type MethodologyFile } from '@/lib/plan/methodology/load'

export const PORTO_TEMPLATE_ID = 'runmate-porto-2026'

export function portoTemplate(): MethodologyFile {
  const file = path.join(process.cwd(), 'examples', 'porto-2026', `${PORTO_TEMPLATE_ID}.md`)
  const r = parseMethodology(readFileSync(file, 'utf8'), `${PORTO_TEMPLATE_ID}.md`)
  if (!r.ok) throw new Error(`${PORTO_TEMPLATE_ID}.md: ${r.errors.join('; ')}`)
  return r.value
}
