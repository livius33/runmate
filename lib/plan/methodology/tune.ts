// "Mein Ansatz" (07-05): the runner's own values for a whitelist of template parameters, merged into the template and then
// checked like any template file — schema ranges first, then the fixed safety limits. Pure.
import { MethodologySchema, type Distance, type Methodology } from './schema'
import { checkSafety } from './safety'

export type TuneGroup = 'Woche' | 'Longrun' | 'Phasen' | 'Umfang und Erholung' | 'Spitze' | 'Taper' | 'Intensität' | 'Einheiten' | 'Tempo'
  | 'Anpassung' | 'Nebenrennen und Pause'
export interface TuneField {
  path: string
  label: string
  group: TuneGroup
  kind: 'int' | 'share' | 'number' | 'bool' | 'choice'   // share = 0–1, shown as %
  options?: { value: string; label: string }[]           // choice only
  min: number
  max: number
  unit?: string
  hint?: string
}
export type Tuning = Record<string, number | boolean | string>

const BASE: TuneField[] = [
  { path: 'week.runs', label: 'Läufe pro Woche', group: 'Woche', kind: 'int', min: 2, max: 14 },
  { path: 'week.key_sessions.base', label: 'Schlüsseleinheiten Grundlage', group: 'Woche', kind: 'int', min: 0, max: 4 },
  { path: 'week.key_sessions.build', label: 'Schlüsseleinheiten Aufbau', group: 'Woche', kind: 'int', min: 0, max: 4 },
  { path: 'week.key_sessions.peak', label: 'Schlüsseleinheiten Spitze', group: 'Woche', kind: 'int', min: 0, max: 4 },
  { path: 'week.key_sessions.taper', label: 'Schlüsseleinheiten Taper', group: 'Woche', kind: 'int', min: 0, max: 4 },
  { path: 'week.key_gap_days', label: 'Tage zwischen harten Einheiten', group: 'Woche', kind: 'int', min: 1, max: 4, hint: '1 = zwei harte Tage dürfen sich berühren' },
  { path: 'week.long_run.share', label: 'Longrun höchstens', group: 'Longrun', kind: 'share', min: 0.15, max: 0.4, unit: '% der Woche' },
  { path: 'week.long_run.max_km', label: 'Longrun höchstens', group: 'Longrun', kind: 'number', min: 10, max: 42, unit: 'km' },
  { path: 'week.long_run.max_minutes', label: 'Longrun höchstens', group: 'Longrun', kind: 'int', min: 60, max: 240, unit: 'min' },
  { path: 'week.long_run.race_pace', label: 'Renntempo im Longrun', group: 'Longrun', kind: 'bool', min: 0, max: 1 },
  { path: 'volume.ramp_max', label: 'Steigerung pro Woche höchstens', group: 'Umfang und Erholung', kind: 'share', min: 0.03, max: 0.15, unit: '%' },
  { path: 'volume.recovery_week.every', label: 'Erholungswoche alle', group: 'Umfang und Erholung', kind: 'int', min: 2, max: 6, unit: 'Wochen' },
  { path: 'volume.recovery_week.volume', label: 'Erholungswoche', group: 'Umfang und Erholung', kind: 'share', min: 0.5, max: 0.9, unit: '% der Woche davor' },
  { path: 'volume.peak.over_base', label: 'Spitze höchstens', group: 'Spitze', kind: 'number', min: 1.1, max: 1.6, unit: '× aktueller Umfang' },
  { path: 'volume.growth', label: 'Wachstum über bekanntem Umfang', group: 'Spitze', kind: 'share', min: 0.02, max: 0.08, unit: '% pro Woche' },
  { path: 'volume.growth_return', label: 'Wachstum zurück zu bekanntem Umfang', group: 'Spitze', kind: 'share', min: 0.04, max: 0.1, unit: '% pro Woche' },
  // How the running plan reacts (engine and Plan anpassen, 07-07); bounds = the safety limits.
  { path: 'adaptation.thresholds.tsb_fatigue', label: 'Sehr müde ab TSB', group: 'Anpassung', kind: 'number', min: -40, max: -10, hint: 'darunter wird die nächste harte Einheit locker' },
  { path: 'adaptation.thresholds.acwr_caution', label: 'Belastung zu hoch ab ACWR', group: 'Anpassung', kind: 'number', min: 1.1, max: 1.5 },
  { path: 'adaptation.fatigue.share', label: 'Müde: Einheit behält', group: 'Anpassung', kind: 'share', min: 0.5, max: 0.9, unit: '% der km' },
  { path: 'adaptation.fatigue.days', label: 'Ermüdungsschutz schaut voraus', group: 'Anpassung', kind: 'int', min: 1, max: 7, unit: 'Tage' },
  { path: 'adaptation.missed_key.strategy', label: 'Verpasste Schlüsseleinheit', group: 'Anpassung', kind: 'choice', min: 0, max: 0,
    options: [{ value: 'move', label: 'nachholen' }, { value: 'drop', label: 'auslassen' }] },
  { path: 'adaptation.missed_key.max_shift_days', label: 'Nachholen höchstens', group: 'Anpassung', kind: 'int', min: 1, max: 14, unit: 'Tage später' },
  { path: 'adaptation.missed_km.strategy', label: 'Fehlende km der Woche', group: 'Anpassung', kind: 'choice', min: 0, max: 0,
    options: [{ value: 'redistribute', label: 'verteilen' }, { value: 'drop', label: 'weglassen' }] },
  { path: 'adaptation.missed_km.cap_pct', label: 'Verteilen pro Tag höchstens', group: 'Anpassung', kind: 'share', min: 0.05, max: 0.5, unit: '% mehr' },
  { path: 'adaptation.missed_km.cap_km', label: 'Verteilen pro Tag höchstens', group: 'Anpassung', kind: 'number', min: 1, max: 8, unit: 'km mehr' },
  { path: 'adaptation.volume_review.below', label: 'Weniger Umfang vorschlagen unter', group: 'Anpassung', kind: 'share', min: 0.5, max: 0.95, unit: '% vom Plan' },
  { path: 'adaptation.volume_review.above', label: 'Mehr Umfang vorschlagen ab', group: 'Anpassung', kind: 'share', min: 1.05, max: 1.5, unit: '% vom Plan' },
  { path: 'adaptation.triggers.fatigue_tsb', label: 'Sehr müde', group: 'Anpassung', kind: 'choice', min: 0, max: 0,
    options: [{ value: 'intensity_reduction', label: 'nächste harte Einheit locker' }, { value: 'recovery_week_insertion', label: 'zusätzlich nächste Woche Erholungswoche' }] },
  // 07-18 (research modifiers.md 5.3, adaptation.md 4.3)
  { path: 'adaptation.events.pre_easy_days.short', label: 'Lockere Tage vor einem Rennen bis 10 km', group: 'Nebenrennen und Pause', kind: 'int', min: 1, max: 5 },
  { path: 'adaptation.events.pre_easy_days.half', label: 'Lockere Tage vor einem Rennen bis Halbmarathon', group: 'Nebenrennen und Pause', kind: 'int', min: 1, max: 6 },
  { path: 'adaptation.events.pre_easy_days.long', label: 'Lockere Tage vor einem längeren Rennen', group: 'Nebenrennen und Pause', kind: 'int', min: 1, max: 7 },
  { path: 'adaptation.events.post_easy.per_km', label: 'Nach einem Aufbaurennen ein lockerer Tag je', group: 'Nebenrennen und Pause', kind: 'number', min: 2, max: 6, unit: 'km' },
  { path: 'adaptation.events.build_from_km', label: 'Aufbaurennen vorschlagen ab', group: 'Nebenrennen und Pause', kind: 'number', min: 3, max: 42.2, unit: 'km' },
  { path: 'adaptation.events.test_window_days', label: 'Renntempo-Test vorschlagen in den letzten', group: 'Nebenrennen und Pause', kind: 'int', min: 0, max: 56, unit: 'Tagen' },
  { path: 'adaptation.events.light_from_km', label: 'Leichte Woche ab einem Rennen von', group: 'Nebenrennen und Pause', kind: 'number', min: 5, max: 42.2, unit: 'km' },
  { path: 'adaptation.return.week1_share', label: 'Nach einer Pause: Woche 1 höchstens', group: 'Nebenrennen und Pause', kind: 'share', min: 0.3, max: 0.8, unit: '% der letzten Belastungswoche' },
  { path: 'adaptation.return.week2_share', label: 'Nach einer Pause: Woche 2 höchstens', group: 'Nebenrennen und Pause', kind: 'share', min: 0.5, max: 1, unit: '% der letzten Belastungswoche' },
  { path: 'adaptation.return.week2_quality', label: 'Nach einer Pause in Woche 2', group: 'Nebenrennen und Pause', kind: 'choice', min: 0, max: 0,
    options: [{ value: 'threshold', label: 'Schwelle statt Renntempo' }, { value: 'easy', label: 'nur locker mit Steigerungen' }] },
  { path: 'adaptation.return.long_share', label: 'Nach einer Pause: Longrun höchstens', group: 'Nebenrennen und Pause', kind: 'share', min: 0.5, max: 0.9, unit: '% des längsten davor' },
]

// Values a template may leave out (07-18): what applies then — the same numbers as lib/plan/events.ts EVENT_RULES and
// lib/plan/pause.ts RETURN_RULES (a test keeps them equal).
export const OPTIONAL_DEFAULTS: Record<string, number | string> = {
  'adaptation.events.pre_easy_days.short': 2, 'adaptation.events.pre_easy_days.half': 3, 'adaptation.events.pre_easy_days.long': 4,
  'adaptation.events.post_easy.per_km': 3.5, 'adaptation.events.post_easy.min': 2,
  'adaptation.events.build_from_km': 15, 'adaptation.events.test_window_days': 21, 'adaptation.events.light_from_km': 15,
  'adaptation.return.week1_share': 0.7, 'adaptation.return.week2_share': 0.9, 'adaptation.return.week2_quality': 'threshold',
  'adaptation.return.long_share': 0.8,
}
// The value in effect for a field: the template's own, else the default.
export const fieldValue = (m: Methodology, path: string) => getPath(m, path) ?? OPTIONAL_DEFAULTS[path]

// The fields a template offers: the base list plus taper weeks for each of its distances.
export function tuneFields(m: Methodology): TuneField[] {
  // Taper first in the list order of groups, adaptation last (it is about the running plan, not the draft).
  const taper = m.distances.map((d): TuneField => ({
    path: `phases.taper.weeks.${d}`, label: `Taper ${d === 'half' ? 'Halbmarathon' : d === 'marathon' ? 'Marathon' : '10 km'}`, group: 'Taper',
    kind: 'int', min: 1, max: d === 'marathon' ? 4 : 3, unit: 'Wochen',
  }))
  const late = (f: TuneField) => f.group === 'Anpassung' || f.group === 'Nebenrennen und Pause'
  return [...BASE.filter((f) => !late(f)), ...taper, ...BASE.filter(late)]
}

export function getPath(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((x, k) => (x != null && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o)
}
function setPath(o: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split('.')
  let cur = o
  for (const k of keys.slice(0, -1)) { cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] as Record<string, unknown> ?? {}) }; cur = cur[k] as Record<string, unknown> }
  cur[keys[keys.length - 1]] = v
}

const num = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',').replace('-', '−')

// Merge the runner's values into the template; German errors per field when a value is unknown, out of range or unsafe.
// `fields` = what may be set (default "Mein Ansatz"; the own method passes its full list, 07-19).
export function tuneTemplate(m: Methodology, tuning: Tuning, fields: TuneField[] = tuneFields(m)): { ok: true; template: Methodology } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const merged = structuredClone(m) as unknown as Record<string, unknown>
  for (const [path, v] of Object.entries(tuning)) {
    const f = fields.find((x) => x.path === path)
    if (!f) { errors.push(`${path}: nicht einstellbar`); continue }
    if (f.kind === 'bool') {
      if (typeof v !== 'boolean') { errors.push(`${f.label}: ja oder nein`); continue }
    } else if (f.kind === 'choice') {
      if (!f.options?.some((o) => o.value === v)) { errors.push(`${f.label}: ${f.options?.map((o) => o.label).join(' oder ')}`); continue }
    } else if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max || (f.kind === 'int' && !Number.isInteger(v))) {
      const show = (x: number) => (f.kind === 'share' ? `${Math.round(x * 100)} %` : num(x))
      errors.push(`${f.label}: ${show(f.min)}${f.min < 0 ? ' bis ' : '–'}${show(f.max)}${f.kind === 'int' ? ', ganze Zahl' : ''}`)
      continue
    }
    // An optional object the template leaves out gets its other fields from the defaults (schema needs them whole).
    const parent = path.slice(0, path.lastIndexOf('.'))
    for (const [k, d] of Object.entries(OPTIONAL_DEFAULTS)) {
      if (k.slice(0, k.lastIndexOf('.')) === parent && getPath(merged, k) === undefined) setPath(merged, k, d)
    }
    setPath(merged, path, v)
  }
  if (errors.length) return { ok: false, errors }
  const parsed = MethodologySchema.safeParse(merged)
  const safety = checkSafety(merged).map((s) => `${s.path}: ${s.message}`)
  if (!parsed.success || safety.length) {
    return { ok: false, errors: [...(parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)), ...safety] }
  }
  return { ok: true, template: parsed.data }
}

// What the picker shows per template (after the runner's values).
export function templateKeys(m: Methodology, distance?: Distance) {
  return {
    runs: m.week.runs, keyBuild: m.week.key_sessions.build, recoveryEvery: m.volume.recovery_week.every,
    taperWeeks: distance ? m.phases.taper.weeks[distance] ?? null : null, longShare: m.week.long_run.share, raceInLong: m.week.long_run.race_pace,
  }
}
