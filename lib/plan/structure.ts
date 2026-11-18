// Workout structure from the plan notes: read it, say it in plain German, rescale it when the
// day's km change, and explain the terms. Pure.
//   "3 ein → 2 × 5 km @ 4:15 (1 km Trab) → 3 aus. Nur auf erholten Beinen."
//   "Früh starten wie am Renntag: 4 ein → 6 km @ 4:23 → 3 aus."
//   "10 locker → 15 km @ 4:23 → 5 ausrollen. Verpflegung üben: 60–90 g KH/h."
import { fmtKm, paceToS } from './format'
import { activeBlock, blockFor, blockPaces } from './blocks'
import { todayLocal } from '@/lib/dates'
import { hrZones } from '@/lib/analytics/hr'

export interface Structure {
  prefix: string            // text before the structure ("Früh starten wie am Renntag: ")
  warmKm: number
  warmWord: string          // 'ein' | 'locker' | 'km locker'
  reps: number              // 1 = continuous block
  repKm: number
  pace: string
  recKm: number             // recovery between reps
  recWord: string           // 'Trab' | 'Trabpause'
  coolKm: number
  coolWord: string          // 'aus' | 'ausrollen' | 'km ausrollen'
  suffix: string            // text after the structure (". Nur auf erholten Beinen.")
}

const NUM = '(\\d+(?:[.,]\\d+)?)'
const RE = new RegExp(
  `^(.*?)${NUM}\\s*(km locker|ein|locker)\\s*→\\s*` +
  `(?:${NUM}\\s*×\\s*)?${NUM}\\s*km\\s*@\\s*(\\d{1,2}:\\d{2})` +
  `(?:\\s*\\(${NUM}\\s*km\\s*(Trabpause|Trab)\\))?` +
  `\\s*→\\s*${NUM}\\s*(km ausrollen|ausrollen|aus)(.*)$`,
)
const num = (s: string | undefined) => (s == null ? 0 : Number(s.replace(',', '.')))
const half = (n: number) => Math.round(n * 2) / 2

export function parseStructure(notes?: string): Structure | null {
  const m = notes?.match(RE)
  if (!m) return null
  return {
    prefix: m[1], warmKm: num(m[2]), warmWord: m[3],
    reps: m[4] ? num(m[4]) : 1, repKm: num(m[5]), pace: m[6],
    recKm: num(m[7]), recWord: m[8] ?? 'Trab',
    coolKm: num(m[9]), coolWord: m[10], suffix: m[11],
  }
}

export const blockKm = (s: Structure) => s.reps * s.repKm + (s.reps - 1) * s.recKm
export const totalKm = (s: Structure) => s.warmKm + blockKm(s) + s.coolKm

export function formatNotes(s: Structure): string {
  const block = s.reps > 1
    ? `${s.reps} × ${fmtKm(s.repKm)} km @ ${s.pace} (${fmtKm(s.recKm)} km ${s.recWord})`
    : `${fmtKm(s.repKm)} km @ ${s.pace}`
  return `${s.prefix}${fmtKm(s.warmKm)} ${s.warmWord} → ${block} → ${fmtKm(s.coolKm)} ${s.coolWord}${s.suffix}`
}

function paceName(pace: string, goalPaceS: number) {
  const p = paceToS(pace)
  if (p === goalPaceS) return 'Renntempo'
  return p < goalPaceS ? 'Schwellentempo' : 'etwas langsamer als Renntempo'
}

// Plain German, one line per part. Paces are named against the goal pace of the active block's race.
export function describeStructure(s: Structure, goalPaceS = activeBlock(todayLocal()).race.goalPaceS): string[] {
  const warm = s.warmWord === 'ein' ? 'einlaufen' : 'locker einlaufen'
  const cool = s.coolWord === 'aus' ? 'auslaufen' : 'locker ausrollen'
  const block = s.reps > 1
    ? `${s.reps} × ${fmtKm(s.repKm)} km in ${s.pace}/km (${paceName(s.pace, goalPaceS)}), dazwischen je ${fmtKm(s.recKm)} km locker traben`
    : `${fmtKm(s.repKm)} km am Stück in ${s.pace}/km (${paceName(s.pace, goalPaceS)})`
  return [`${fmtKm(s.warmKm)} km ${warm}`, block, `${fmtKm(s.coolKm)} km ${cool}`]
}

export type Rescaled =
  | { ok: true; structure: Structure }
  | { ok: false; reason: 'block'; proposal: Structure }   // block does not fit: shorter block offered

const MIN_WARM_COOL = 1   // at least 1 km ein and 1 km aus

// New total km: the quality block stays, warm-up and cool-down share the rest in their old
// ratio (0,5 km steps). If less than 1 km each is left, propose a shorter block.
export function rescale(s: Structure, km: number): Rescaled {
  const fit = (st: Structure): Structure | null => {
    const rest = km - blockKm(st)
    if (rest < 2 * MIN_WARM_COOL) return null
    const share = st.warmKm + st.coolKm > 0 ? st.warmKm / (st.warmKm + st.coolKm) : 0.5
    const warmKm = Math.min(rest - MIN_WARM_COOL, Math.max(MIN_WARM_COOL, half(rest * share)))
    return { ...st, warmKm, coolKm: Math.round((rest - warmKm) * 10) / 10 }
  }
  const same = fit(s)
  if (same) return { ok: true, structure: same }
  // Short reps (≤ 1 km, e.g. 8 × 400 m): fewer reps of the same length, at least 2.
  if (s.reps > 1 && s.repKm <= 1) {
    for (let reps = s.reps - 1; reps >= 2; reps--) {
      const p = fit({ ...s, reps })
      if (p) return { ok: false, reason: 'block', proposal: p }
    }
  }
  // Longer reps: first shorter reps (1 km steps, at least 1 km), then fewer reps.
  for (let reps = s.reps; reps >= 1; reps--) {
    for (let repKm = reps === s.reps ? s.repKm - 1 : s.repKm; repKm >= 1; repKm--) {
      const p = fit({ ...s, reps, repKm })
      if (p) return { ok: false, reason: 'block', proposal: p }
    }
  }
  return { ok: false, reason: 'block', proposal: { ...s, reps: 1, repKm: Math.max(1, km - 2), warmKm: 1, coolKm: 1 } }
}

// Session types that never carry a workout structure (an easy run is just km in Zone 2).
const NO_STRUCTURE = new Set(['easy', 'recovery', 'rest'])

// The structure of a session, or null for easy/recovery/rest days.
export function sessionStructure(s: { type: string; notes?: string } | undefined): Structure | null {
  if (!s || NO_STRUCTURE.has(s.type)) return null
  return parseStructure(s.notes)
}

// Fits a session's workout text to its km, wherever the km came from (edit, merge, carry-over, engine):
// warm-up/cool-down follow, a block that no longer fits is shortened and the plan is noted.
// A partial session ("Rest … km → …": km = what was run) and a matching total stay as they are.
export function fitSession<T extends { type: string; km?: number; notes?: string }>(s: T): T {
  const st = sessionStructure(s)
  if (!st || !s.km || /Rest \d/.test(s.notes ?? '')) return s
  if (Math.abs(totalKm(st) - s.km) < 0.05) return s
  const r = rescale(st, s.km)
  if (r.ok) return { ...s, notes: formatNotes(r.structure) }
  const planned = st.reps > 1 ? `${st.reps} × ${fmtKm(st.repKm)} km` : `${fmtKm(st.repKm)} km`
  const text = formatNotes(r.proposal).trimEnd()
  return { ...s, notes: `${text}${/[.!]$/.test(text) ? '' : '.'} Block gekürzt (geplant: ${planned}).` }
}

export function stridesCount(notes?: string): number | null {
  const m = notes?.match(/(\d+)\s*Steigerungen/)
  return m ? Number(m[1]) : null
}

// Short definitions for the terms used in the plan.
export const GLOSSARY: Record<string, string> = {
  Steigerungen: 'Kurze Beschleunigungen am Ende eines lockeren Laufs: je ca. 20 Sekunden (80–100 m) zügig bis etwa 5-km-Renntempo, dann locker zurückgehen oder traben. Halten die Beine schnell, ohne zu ermüden.',
  Trabpause: 'Lockeres, langsames Traben zwischen zwei schnellen Abschnitten, damit sich der Puls etwas erholt. Nicht stehen bleiben.',
  Einlaufen: 'Ruhiger Beginn im Grundlagentempo, bevor es schnell wird. Wärmt Muskeln und Kreislauf auf.',
  Auslaufen: 'Ruhiges Ende nach dem schnellen Teil, damit sich der Körper herunterfährt.',
  'Zone 2': `Lockerer Puls zwischen ${hrZones()[1].min} und ${hrZones()[1].max}. Man kann sich noch gut unterhalten. Baut die Ausdauer auf.`,
  Renntempo: 'Das Zieltempo des Rennens, auf das der Block hinarbeitet.',
  Schwelle: 'Zügiges, aber kontrolliertes Tempo knapp unter dem, was man eine Stunde halten könnte (hier 4:15/km). Hebt das Tempo, das sich noch locker anfühlt.',
  Regeneration: 'Sehr lockerer, kurzer Lauf zur Erholung. Lieber zu langsam als zu schnell.',
  Longrun: 'Langer Lauf für die Ausdauer. Mit Renntempo-Abschnitt üben Beine und Verpflegung den Marathon.',
  Generalprobe: 'Der große Test vor dem Rennen: alles wie am Renntag. Entscheidet mit über die Startpace.',
  'Finaler Test': 'Der letzte Test vor dem Rennen, gleichmäßig im Renntempo. Der zuletzt gelaufene Test entscheidet über die Startpace.',
}

// The glossary for a session's date: the general texts, or the same terms for the block's own race and paces (07-20).
export function glossaryFor(date: string): Record<string, string> {
  const b = blockFor(date)
  if (!b) return { ...GLOSSARY, Schwelle: GLOSSARY.Schwelle.replace(' (hier 4:15/km)', '') }
  const p = blockPaces(date), r = b.race
  const h = Math.floor(r.goalS / 3600), m = String(Math.floor((r.goalS % 3600) / 60)).padStart(2, '0')
  return {
    ...GLOSSARY,
    Renntempo: `Das Tempo für ${r.name}: ${p.race}/km für das Ziel ${h}:${m}.`,
    Schwelle: GLOSSARY.Schwelle.replace('(hier 4:15/km)', `(hier ${p.threshold}/km)`),
    Longrun: r.distanceKm > 30 ? GLOSSARY.Longrun : 'Langer Lauf für die Ausdauer. Mit Renntempo-Abschnitt üben die Beine das Tempo des Rennens.',
    Generalprobe: `Der große Test vor ${r.name}: alles wie am Renntag. Entscheidet mit über die Startpace.`,
    'Finaler Test': `Der letzte Test vor ${r.name}, gleichmäßig im Renntempo. Der zuletzt gelaufene Test entscheidet über die Startpace.`,
  }
}

// Glossary terms that appear in a session's title or notes; `date` picks the block's paces.
export function termsIn(title: string, notes?: string, date?: string): string[] {
  const text = `${title} ${notes ?? ''}`
  const own = date ? blockPaces(date) : null
  const never = /(?!)/
  const at = (pace: string) => new RegExp(`@ ${pace}`)
  const has = (re: RegExp) => re.test(text)
  return Object.keys(GLOSSARY).filter((t) =>
    t === 'Trabpause' ? has(/Trab/) : t === 'Einlaufen' ? has(/\bein\b|einlaufen|\d+\s*km locker →|\d+\s*locker →/)
      : t === 'Auslaufen' ? has(/\baus\b|ausrollen|auslaufen/) : t === 'Renntempo' ? has(/Renntempo/) || has(own ? at(own.race) : never)
        : t === 'Schwelle' ? has(/Schwelle/) || has(own ? at(own.threshold) : never) : t === 'Longrun' ? has(/Longrun/) : has(new RegExp(t)))
}
