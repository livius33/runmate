// The runner's own numbers (Phase 2): one `user_profile` row per user. Zones, race HR caps, TRIMP, the athlete facts
// and "today" derive from it (lib/analytics/hr.ts, lib/athlete.ts, lib/dates.ts read it through lib/scope.ts).
// Pure: no database here (lib/profile-store.ts loads and saves it).
//
// A missing profile or field falls back to DEFAULT_PROFILE, and `defaults` lists which fields did, so the UI can mark
// them ("Beispielwert") instead of presenting them as the runner's own.

export const ZONE_MODELS = ['hrmax', 'lthr'] as const
export type ZoneModel = (typeof ZONE_MODELS)[number]

// As stored: every field may be empty (null = use the default).
export interface UserProfile {
  hrMax: number | null
  hrRest: number | null
  lthr: number | null            // lactate-threshold HR; only used with zoneModel 'lthr'
  zoneModel: ZoneModel | null
  pbTime: string | null          // marathon PB 'h:mm' or 'h:mm:ss'
  pbRace: string | null
  pbHr: number | null            // average HR of that race; missing = 84 % HFmax (research paces.md §2.1)
  vo2max: number | null
  weightKg: number | null        // carb-loading amounts
  easyPace: string | null        // 'm:ss' per km
  timezone: string | null        // IANA, e.g. 'Europe/Berlin'
  locale: string | null          // 'de' (the only UI language so far)
}

export type ProfileField = keyof UserProfile

// Every field filled (LTHR stays optional: the 'lthr' model falls back to 'hrmax' without it).
export type FilledProfile = { [K in Exclude<ProfileField, 'lthr'>]: NonNullable<UserProfile[K]> } & { lthr: number | null }

export interface ResolvedProfile extends FilledProfile {
  zoneModelUsed: ZoneModel       // what the zones are actually derived from
  defaults: ProfileField[]       // fields that are example defaults, not the runner's own
}

export const DEFAULT_TIME_ZONE = 'Europe/Berlin'

// EXAMPLE DEFAULTS — a neutral sample runner, not anyone's measured values (the values the app shipped with).
export const DEFAULT_PROFILE: Readonly<FilledProfile> = {
  hrMax: 190, hrRest: 60, lthr: null, zoneModel: 'hrmax',
  pbTime: '3:30', pbRace: 'Beispiel-Marathon', pbHr: Math.round(190 * 0.84),
  vo2max: 50, weightKg: 70, easyPace: '6:00',
  timezone: DEFAULT_TIME_ZONE, locale: 'de',
}

const FIELDS: ProfileField[] = ['hrMax', 'hrRest', 'lthr', 'zoneModel', 'pbTime', 'pbRace', 'pbHr', 'vo2max', 'weightKg', 'easyPace', 'timezone', 'locale']

const resolved = new WeakMap<object, ResolvedProfile>()

// Stored (possibly partial) profile → every field filled; same input object → same result object (cheap to call often).
export function resolveProfile(p: Partial<UserProfile> | null | undefined): ResolvedProfile {
  const key = p ?? NONE
  const hit = resolved.get(key)
  if (hit) return hit
  const own = (f: ProfileField) => p != null && p[f] != null
  const defaults = FIELDS.filter((f) => !own(f) && f !== 'lthr')
  const hrMax = p?.hrMax ?? DEFAULT_PROFILE.hrMax
  const lthr = p?.lthr ?? null
  const zoneModel = p?.zoneModel ?? DEFAULT_PROFILE.zoneModel
  const out: ResolvedProfile = {
    hrMax,
    hrRest: p?.hrRest ?? DEFAULT_PROFILE.hrRest,
    lthr,
    zoneModel,
    zoneModelUsed: zoneModel === 'lthr' && lthr != null ? 'lthr' : 'hrmax',
    pbTime: p?.pbTime ?? DEFAULT_PROFILE.pbTime,
    pbRace: p?.pbRace ?? DEFAULT_PROFILE.pbRace,
    pbHr: p?.pbHr ?? Math.round(hrMax * 0.84),
    vo2max: p?.vo2max ?? DEFAULT_PROFILE.vo2max,
    weightKg: p?.weightKg ?? DEFAULT_PROFILE.weightKg,
    easyPace: p?.easyPace ?? DEFAULT_PROFILE.easyPace,
    timezone: p?.timezone && validTimeZone(p.timezone) ? p.timezone : DEFAULT_PROFILE.timezone,
    locale: p?.locale ?? DEFAULT_PROFILE.locale,
    defaults,
  }
  resolved.set(key, out)
  return out
}
const NONE = {}
export const DEFAULT_RESOLVED = resolveProfile(null)

export function validTimeZone(tz: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}

const PACE = /^\d{1,2}:[0-5]\d$/
const CLOCK = /^\d{1,2}:[0-5]\d(:[0-5]\d)?$/

// Form input → a profile to store, or a German error. Empty fields are stored as null (= default).
export function validateProfile(raw: unknown): { ok: true; profile: UserProfile } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Profil fehlt.' }
  const r = raw as Record<string, unknown>
  const num = (k: string, lo: number, hi: number, label: string): number | null | string => {
    const v = r[k]
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : `${label}: bitte ${lo}–${hi} oder leer lassen.`
  }
  const str = (k: string, re: RegExp | null, label: string, max = 60): string | null | { error: string } => {
    const v = r[k]
    if (v == null || v === '') return null
    if (typeof v !== 'string' || v.length > max || (re && !re.test(v.trim()))) return { error: `${label}: Format prüfen.` }
    return v.trim()
  }
  const hrMax = num('hrMax', 120, 230, 'HFmax'), hrRest = num('hrRest', 30, 110, 'Ruhepuls'), lthr = num('lthr', 100, 220, 'LTHR')
  const pbHr = num('pbHr', 100, 230, 'Puls der Bestzeit'), vo2max = num('vo2max', 20, 90, 'VO2max'), weightKg = num('weightKg', 30, 200, 'Gewicht')
  for (const v of [hrMax, hrRest, lthr, pbHr, vo2max, weightKg]) if (typeof v === 'string') return { ok: false, error: v }
  const pbTime = str('pbTime', CLOCK, 'Bestzeit'), pbRace = str('pbRace', null, 'Rennen'), easyPace = str('easyPace', PACE, 'Lockeres Tempo')
  const timezone = str('timezone', null, 'Zeitzone', 64), locale = str('locale', /^[a-z]{2}(-[A-Z]{2})?$/, 'Sprache', 10)
  for (const v of [pbTime, pbRace, easyPace, timezone, locale]) if (v && typeof v === 'object') return { ok: false, error: v.error }
  if (timezone && !validTimeZone(timezone as string)) return { ok: false, error: 'Zeitzone unbekannt (z. B. Europe/Berlin).' }
  const zoneModel = r.zoneModel == null || r.zoneModel === '' ? 'hrmax' : r.zoneModel
  if (!ZONE_MODELS.includes(zoneModel as ZoneModel)) return { ok: false, error: 'Zonenmodell unbekannt.' }
  if (zoneModel === 'lthr' && lthr == null) return { ok: false, error: 'Das LTHR-Modell braucht eine LTHR.' }
  const max = (hrMax as number | null) ?? DEFAULT_PROFILE.hrMax, rest = (hrRest as number | null) ?? DEFAULT_PROFILE.hrRest
  if (rest >= max - 40) return { ok: false, error: 'Ruhepuls und HFmax passen nicht zusammen.' }
  if (lthr != null && (lthr as number) >= max) return { ok: false, error: 'Die LTHR muss unter der HFmax liegen.' }
  return {
    ok: true,
    profile: {
      hrMax: hrMax as number | null, hrRest: hrRest as number | null,
      lthr: lthr as number | null, zoneModel: r.zoneModel == null || r.zoneModel === '' ? null : zoneModel as ZoneModel,
      pbTime: pbTime as string | null, pbRace: pbRace as string | null, pbHr: pbHr as number | null,
      vo2max: vo2max as number | null, weightKg: weightKg as number | null, easyPace: easyPace as string | null,
      timezone: timezone as string | null, locale: locale as string | null,
    },
  }
}
