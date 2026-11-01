// Own method without a template (07-19): a neutral base per distance (methodologies/own/runmate-own-<distance>.md, values
// from the research notes only) plus the runner's values for every field of the schema except id/version/sources. Merged and
// then checked exactly like a template file — schema ranges, then the fixed safety limits. Pure.
import { PACE_NAMES, PHASES, type Distance, type Methodology, type WorkoutKind } from './schema'
import { getPath, tuneFields, tuneTemplate, type TuneField, type TuneGroup, type Tuning } from './tune'

export const OWN_KEY = 'methodology_own'    // settings: StoredOwn
export const OWN_PREFIX = 'runmate-own-'    // template ids of the neutral bases
export const OWN_NAME = 'Ohne Vorlage – eigene Methode'
export interface StoredOwn { v: 1; name: string; byDistance: Partial<Record<Distance, Tuning>>; savedAt: string | null }
export const isOwn = (templateId: string) => templateId.startsWith(OWN_PREFIX)

const PHASE_LABEL = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' } as const
const KIND_LABEL: Record<WorkoutKind, string> = {
  easy: 'Locker', recovery: 'Regeneration', strides: 'Steigerungen', hills: 'Hügel', tempo: 'Tempodauerlauf', threshold: 'Schwelle',
  intervals_vo2: 'VO2max-Intervalle', marathon_pace: 'Marathontempo', half_marathon_pace: 'HM-Tempo', medium_long: 'Mittellanger Lauf',
  long_easy: 'Lockerer Longrun', long_with_pace: 'Longrun mit Tempo', progression: 'Steigerungslauf', test: 'Test / Vorbereitungsrennen',
}
const PACE_LABEL: Record<(typeof PACE_NAMES)[number], string> = {
  easy: 'Locker', recovery: 'Regeneration', long: 'Longrun', marathon_pace: 'Marathontempo', half_marathon_pace: 'HM-Tempo',
  threshold: 'Schwelle', intervals_vo2: 'VO2max', strides: 'Steigerungen',
}
const ORDER: TuneGroup[] = ['Woche', 'Longrun', 'Phasen', 'Umfang und Erholung', 'Spitze', 'Taper', 'Intensität', 'Einheiten', 'Tempo', 'Anpassung', 'Nebenrennen und Pause']

// Workout kinds the base uses anywhere: each can be switched on or off per phase (ranges from the base, no free builder).
const kindsOf = (base: Methodology) => [...new Set(PHASES.flatMap((p) => base.workouts[p].map((w) => w.kind)))]

// Every field of the own method: "Mein Ansatz" plus phases, volume, intensity, workouts and paces. Not offered: values of
// other distances, and adaptation triggers the engine does not read (only fatigue_tsb, lib/plan/rules.ts).
export function ownFields(base: Methodology): TuneField[] {
  const f = (path: string, label: string, group: TuneGroup, kind: TuneField['kind'], min: number, max: number, unit?: string, hint?: string): TuneField =>
    ({ path, label, group, kind, min, max, unit, hint })
  const T = base.phases.taper.volume.length
  const d = base.distances[0]
  const extra: TuneField[] = [
    ...(['base', 'build', 'peak'] as const).map((p) => f(`phases.split.${p}`, `Anteil ${PHASE_LABEL[p]}`, 'Phasen', 'share', 0.1, 0.7, '% der Wochen vor dem Taper', p === 'peak' ? 'die drei Anteile ergeben 100 %' : undefined)),
    ...base.phases.taper.volume.map((_, i) => f(`phases.taper.volume.${i}`, i === T - 1 ? 'Rennwoche' : `Taper Woche ${i + 1}`, 'Taper', 'share', 0.2, 1, '% der Spitze')),
    ...(['base', 'build', 'peak'] as const).map((p) => f(`phases.min_weeks.${d}.${p}`, `${PHASE_LABEL[p]} mindestens`, 'Phasen', 'int', 0, 12, 'Wochen')),
    ...[0, 1, 2].map((i): TuneField => ({ path: `phases.shorten_order.${i}`, label: ['Kurzer Plan: zuerst kürzen', 'dann', 'zuletzt'][i], group: 'Phasen', kind: 'choice', min: 0, max: 0,
      options: (['base', 'build', 'peak'] as const).map((p) => ({ value: p, label: PHASE_LABEL[p] })) })),
    f('volume.start', 'Erste Woche', 'Umfang und Erholung', 'share', 0.4, 0.9, '% der Spitze'),
    ...(['base', 'build', 'peak'] as const).flatMap((p) => [
      f(`volume.phases.${p}.0`, `${PHASE_LABEL[p]} von`, 'Umfang und Erholung', 'share', 0.4, 1, '% der Spitze'),
      f(`volume.phases.${p}.1`, `${PHASE_LABEL[p]} bis`, 'Umfang und Erholung', 'share', 0.4, 1, '% der Spitze'),
    ]),
    f('volume.peak.over_proven', 'Spitze höchstens', 'Spitze', 'number', 0.8, 1.1, '× gehaltener Umfang'),
    f(`volume.peak.floor.${d}`, 'Hinweis bei Spitze unter', 'Spitze', 'number', 10, 150, 'km/Woche', 'nur ein Hinweis im Entwurf'),
    f('adaptation.volume_review.weeks', 'Umfang prüfen über', 'Anpassung', 'int', 1, 8, 'Wochen'),
    ...PHASES.flatMap((p) => (['easy', 'moderate', 'hard'] as const).map((z) =>
      f(`intensity.${p}.${z}`, `${PHASE_LABEL[p]} ${z === 'easy' ? 'locker' : z === 'moderate' ? 'mittel' : 'hart'}`, 'Intensität', 'share', 0, 1, '% der km',
        z === 'hard' && p === 'base' ? 'je Phase ergeben locker + mittel + hart 100 %' : undefined))),
    ...PHASES.flatMap((p) => kindsOf(base).map((k) => f(`workouts.${p}.${k}`, `${PHASE_LABEL[p]}: ${KIND_LABEL[k]}`, 'Einheiten', 'bool', 0, 1))),
    { path: 'paces.source', label: 'Tempo aus', group: 'Tempo', kind: 'choice', min: 0, max: 0,
      options: [{ value: 'goal_time', label: 'Zielzeit' }, { value: 'vdot', label: 'Rennergebnis (VDOT)' }, { value: 'threshold', label: 'Schwellentest' }] },
    ...PACE_NAMES.map((n) => f(`paces.offsets.${n}`, PACE_LABEL[n], 'Tempo', 'int', -60, 150, 's/km zum Renntempo', '+ = langsamer')),
  ]
  const all = [...tuneFields(base), ...extra]
  return ORDER.flatMap((g) => all.filter((x) => x.group === g))
}

// The value a template has for an own-method field (for the editor's placeholders and "Vergleich mit …").
export function ownValue(m: Methodology, path: string): number | boolean | string | undefined {
  const w = path.match(/^workouts\.(\w+)\.(\w+)$/)
  if (w) return (m.workouts[w[1] as (typeof PHASES)[number]] ?? []).some((x) => x.kind === w[2])
  const v = getPath(m, path)
  return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ? v : undefined
}

// Base + the runner's values → a template, or German errors per field.
export function buildOwn(base: Methodology, values: Tuning, name?: string): { ok: true; template: Methodology } | { ok: false; errors: string[] } {
  const fields = ownFields(base)
  const label = new Map(fields.map((x) => [x.path, x.label]))
  const errors: string[] = []
  const m = structuredClone(base)
  const rest: Tuning = {}
  for (const [path, v] of Object.entries(values)) {
    const w = path.match(/^workouts\.(\w+)\.(\w+)$/)
    if (!w) { rest[path] = v; continue }
    if (!label.has(path)) { errors.push(`${path}: nicht einstellbar`); continue }
    if (typeof v !== 'boolean') { errors.push(`${label.get(path)}: ja oder nein`); continue }
    const phase = w[1] as (typeof PHASES)[number]
    const kind = w[2] as WorkoutKind
    const has = m.workouts[phase].some((x) => x.kind === kind)
    // Switched on: the base's entry for this kind from the nearest phase (same range and note).
    const from = [phase, ...PHASES.filter((p) => p !== phase)].map((p) => base.workouts[p].find((x) => x.kind === kind)).find(Boolean)
    if (v && !has && from) m.workouts[phase] = [...m.workouts[phase], { ...from }]
    if (!v) m.workouts[phase] = m.workouts[phase].filter((x) => x.kind !== kind)
  }
  if (name?.trim()) m.name = name.trim().slice(0, 60)
  const r = tuneTemplate(m, rest, fields.filter((x) => !x.path.startsWith('workouts.')))
  if (r.ok) errors.push(...paceOrder(r.template))
  if (r.ok) return errors.length ? { ok: false, errors } : r
  // "intensity.base: Summe …" → "Intensität Grundlage: Summe …"; known fields by their label.
  const named = (e: string) => {
    const [path, ...msg] = e.split(': ')
    const group = path.match(/^intensity\.(\w+)$/)?.[1] ?? path.match(/^phases\.split$/)?.[0]
    if (label.has(path)) return `${label.get(path)}: ${msg.join(': ')}`
    if (path.startsWith('phases.taper.volume.')) return `Taper: ${msg.join(': ')}`
    if (group === 'phases.split') return `Phasen-Anteile: ${msg.join(': ')}`
    if (group) return `Intensität ${PHASE_LABEL[group as (typeof PHASES)[number]] ?? group}: ${msg.join(': ')}`
    return e
  }
  return { ok: false, errors: [...r.errors.map(named), ...errors] }
}

// Paces in a sensible order (research paces.md): otherwise two kinds share a pace and the plan cannot tell them apart.
function paceOrder(m: Methodology): string[] {
  const o = m.paces.offsets
  const at = (n: (typeof PACE_NAMES)[number]) => o[n] ?? 0
  const out: string[] = []
  for (const n of ['easy', 'recovery', 'long'] as const) if (o[n] != null && at(n) <= 0) out.push(`Tempo ${PACE_LABEL[n]}: langsamer als das Renntempo (über 0 s/km)`)
  if (o.intervals_vo2 != null && (at('intervals_vo2') >= 0 || (o.threshold != null && at('intervals_vo2') >= at('threshold')))) {
    out.push('Tempo VO2max: schneller als Renntempo und Schwelle')
  }
  if (o.strides != null && o.intervals_vo2 != null && at('strides') > at('intervals_vo2')) out.push('Tempo Steigerungen: mindestens so schnell wie VO2max')
  return out.length ? out : samePace(m)
}

// No two paced kinds the plan uses on one pace: the generator and the checks tell sessions apart by pace, so e.g. an 8 km
// marathon-pace run at the threshold pace gets the threshold cap (07-19 property). Pace per kind as in generator/workouts.ts.
function samePace(m: Methodology): string[] {
  const race = m.distances[0] === 'marathon' ? 'marathon_pace' : m.distances[0] === 'half' ? 'half_marathon_pace' : null
  const paceOf = (k: WorkoutKind): (typeof PACE_NAMES)[number] | null =>
    k === 'tempo' ? 'threshold' : k === 'long_with_pace' || k === 'progression' ? race ?? 'threshold'
      : k === 'threshold' || k === 'intervals_vo2' || k === 'marathon_pace' || k === 'half_marathon_pace' ? k : null
  // The race kind always counts (tests and the race-week reminder run at race pace); over 10 km race pace is offset 0.
  const names = new Set(PHASES.flatMap((p) => m.workouts[p].map((w) => paceOf(w.kind))).concat(race))
  const paced: [string, number][] = race ? [] : [['Renntempo', 0]]
  for (const n of names) if (n && m.paces.offsets[n] != null) paced.push([PACE_LABEL[n], m.paces.offsets[n]!])
  return paced.flatMap(([a, x], i) => paced.slice(i + 1).filter(([, y]) => y === x)
    .map(([b]) => `Tempo ${a} und ${b}: gleich – die Einheiten wären nicht zu unterscheiden`))
}

