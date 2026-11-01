// Rules every plan change must keep — engine, Plan anpassen and later the generator. Plain plans in,
// German-labelled violations out, so any writer can be checked the same way.
//
// Sources (project decisions): past days never change · race/anchors/tests stay (Phase 2, 05-04) ·
// manual edits win (Phase 2) · taper weeks never gain km (Phase 2, 07-10) · additions capped at
// min(+30 %, +5 km) of the base day (Phase 2) · moved key session: no other key within ±2 days (Phase 2) ·
// unavailable profile days get nothing, profile max km caps additions (07-10) · only synced days count (Phase 4) ·
// no km without a visible reason (Phase 4).
import { addDays, format, parseISO } from 'date-fns'
import { type PlanSession } from '@/lib/plan/types'
import { weekOf } from '@/lib/plan/blocks'
import { maxKm, type Overrides } from '@/lib/plan/effective'
import { dayAvailable, profileMaxKm, type AthleteProfile } from '@/lib/plan/athlete-profile'

export type InvariantRule =
  | 'past-day' | 'protected' | 'manual-written' | 'taper-gain' | 'day-cap' | 'profile-unavailable'
  | 'profile-max' | 'key-gap' | 'unlogged' | 'run-day' | 'recovery-gain'

export interface Violation { rule: InvariantRule; date: string; detail: string }

export interface InvariantContext {
  before: PlanSession[]            // effective plan before the step
  after: PlanSession[]             // effective plan after the step
  today: string
  manual?: Overrides               // The runner's edits; a writer other than 'workshop' must not touch these days
  writes?: string[]                // days the writer itself wrote (engine: overrides keys of its changes)
  logged?: string[]                // days the step's log says it changed; other changed days = violation
  ran?: Set<string>                // days with a run already (never rewritten by a suggestion)
  allowPast?: string[]             // past days a rule may rewrite by design (source day of a moved key session or test, F-04)
  profile?: AthleteProfile | null  // checked for additions when given
  writer: 'engine' | 'workshop' | 'generator'
  isTaper?: (date: string) => boolean   // default: Porto week flags
  isRecovery?: (date: string) => boolean   // default: Porto week flags (recovery after the race, 06-01)
  dayCap?: (date: string) => number     // default: maxKm() of the base plan
  keyGapDays?: number                   // default 2
}

const km = (s?: PlanSession) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)
const same = (a?: PlanSession, b?: PlanSession) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const isProtected = (s?: PlanSession) => !!s && (s.type === 'race' || !!s.anchor || !!s.test)
const plus = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const monday = (d: string) => { const w = (parseISO(d).getDay() + 6) % 7; return plus(d, -w) }
const f1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

export function checkInvariants(ctx: InvariantContext): Violation[] {
  const out: Violation[] = []
  const at = (list: PlanSession[]) => { const m = new Map(list.map((s) => [s.date, s])); return (d: string) => m.get(d) }
  const was = at(ctx.before), now = at(ctx.after)
  const dates = [...new Set([...ctx.before, ...ctx.after].map((s) => s.date))].sort()
  const changed = dates.filter((d) => !same(was(d), now(d)))
  const isTaper = ctx.isTaper ?? ((d: string) => !!weekOf(d)?.taper)
  const dayCap = ctx.dayCap ?? maxKm
  const gap = ctx.keyGapDays ?? 2
  const logged = ctx.logged ? new Set(ctx.logged) : null

  for (const d of changed) {
    const b = was(d), a = now(d)
    const allowed = ctx.allowPast?.includes(d)
    if (d < ctx.today && !allowed) out.push({ rule: 'past-day', date: d, detail: `Vergangener Tag geändert: ${b?.title ?? '–'} → ${a?.title ?? '–'}` })
    // Protected days may get a note or a recalibrated pace, but never move, change type or km.
    if (isProtected(b) && !allowed && (!a || a.type !== b!.type || km(a) !== km(b) || a.title !== b!.title)) {
      out.push({ rule: 'protected', date: d, detail: `Renn-/Anker-/Testtag verändert: ${b!.title} → ${a?.title ?? 'entfernt'}` })
    }
    if (ctx.ran?.has(d) && !allowed) out.push({ rule: 'run-day', date: d, detail: 'Tag mit gelaufenem Lauf umgeschrieben' })
    if (logged && !logged.has(d)) out.push({ rule: 'unlogged', date: d, detail: `Änderung ohne Eintrag: ${b?.title ?? '–'} → ${a?.title ?? '–'}` })

    const gained = km(a) - km(b)
    // Same session with more km = an addition (caps apply); a different session placed here = a move.
    const addition = gained > 0 && !!a && !!b && a.type === b.type && a.title === b.title
    if (addition && km(a) > Math.max(dayCap(d), km(b)) + 1e-9) {
      out.push({ rule: 'day-cap', date: d, detail: `${f1(km(a))} km über der Grenze ${f1(dayCap(d))} km (+30 % / +5 km)` })
    }
    if (gained > 0 && ctx.profile) {
      if (!dayAvailable(ctx.profile, d)) out.push({ rule: 'profile-unavailable', date: d, detail: `+${f1(gained)} km an einem Tag ohne Training laut Profil` })
      const cap = profileMaxKm(ctx.profile, d)
      if (cap != null && km(a) > Math.max(cap, km(b)) + 1e-9) out.push({ rule: 'profile-max', date: d, detail: `${f1(km(a))} km über Profil-Maximum ${cap} km` })
    }
    // A key session placed on this day: no other key session within ±gap days. A neighbour counts when it is
    // still ahead or was run — a missed past session (e.g. the one being caught up) is no load.
    if (a?.key && (!b?.key || b.title !== a.title)) {
      for (let i = -gap; i <= gap; i++) {
        const od = plus(d, i)
        const o = i === 0 ? undefined : now(od)
        const counts = od >= ctx.today || !ctx.ran || ctx.ran.has(od)
        if (o?.key && counts) { out.push({ rule: 'key-gap', date: d, detail: `${a.title} nur ${Math.abs(i)} Tag(e) neben ${o.title}` }); break }
      }
    }
  }

  if (ctx.writer !== 'workshop' && ctx.manual) {
    for (const d of ctx.writes ?? []) {
      if (ctx.manual[d]) out.push({ rule: 'manual-written', date: d, detail: 'Von Hand geänderter Tag vom Programm überschrieben' })
    }
  }

  // Taper and recovery weeks never gain km (whole week, so moves inside the week are fine).
  const isRecovery = ctx.isRecovery ?? ((d: string) => !!weekOf(d)?.recovery)
  for (const [rule, inWeek, label] of [['taper-gain', isTaper, 'Taper'], ['recovery-gain', isRecovery, 'Erholungs']] as const) {
    for (const w of [...new Set(changed.filter(inWeek).map(monday))]) {
      const days = Array.from({ length: 7 }, (_, i) => plus(w, i))
      const sum = (f: (d: string) => PlanSession | undefined) => days.reduce((t, d) => t + km(f(d)), 0)
      if (sum(now) > sum(was) + 1e-9) out.push({ rule, date: w, detail: `${label}-Woche ab ${w}: ${f1(sum(was))} → ${f1(sum(now))} km` })
    }
  }
  return out
}

export const formatViolation = (v: Violation) => `[${v.rule}] ${v.date}: ${v.detail}`

// Days an engine step says it changed: its changes' days, plus the days of changes it took back.
export function engineLogged(added: { key: string; after: Record<string, unknown> }[], log: { id: string; after: Record<string, unknown> }[]) {
  const out = new Set<string>()
  for (const c of added) {
    Object.keys(c.after).forEach((d) => out.add(d))
    if (c.key.startsWith('rebalance-fix:')) {
      const orig = log.find((x) => x.id === c.key.slice('rebalance-fix:'.length))
      Object.keys(orig?.after ?? {}).forEach((d) => out.add(d))
    }
  }
  return [...out]
}
