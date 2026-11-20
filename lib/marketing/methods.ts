// The methodology catalogue for the marketing pages (Phase 6). Server only (reads methodologies/*.md at build time).
// Every valid template gets a page; README.md, own/ (the own-method bases) and research/ are not templates here.
// The sample week is real generator output (generateDraft) for a fictional runner, so the page shows what the
// template actually produces, not a hand-drawn week.
import { listMethodologies, type MethodologyFile } from '@/lib/plan/methodology/load'
import type { Distance } from '@/lib/plan/methodology/schema'
import { generateDraft } from '@/lib/plan/generator/draft'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { SeasonGoal } from '@/lib/season/goals'
import type { PlanSession, SessionType } from '@/lib/plan/types'

export interface SampleDay { date: string; type: SessionType; km: number; title: string; key: boolean }
export interface SampleWeek { goal: string; distance: Distance; phase: string; km: number; days: SampleDay[] }
export interface MethodEntry {
  id: string
  name: string
  family: string
  distances: Distance[]
  summary: string
  sources: MethodologyFile['meta']['sources']
  body: string
  facts: { taperWeeks: number; runs: number; longShare: number; longMaxKm: number; rampMax: number; easyBuild: number }
  week: SampleWeek | null
}

// One label per method family; the chips group the files by it ("Sieben Methoden" = these six + the own method).
const FAMILIES: [string, string][] = [
  ['daniels', 'Daniels'], ['pfitzinger', 'Pfitzinger'], ['hansons', 'Hansons'], ['lydiard', 'Lydiard'],
  ['polarized-80-20', '80/20'], ['norwegian', 'Norwegisch'],
]
export const familyOf = (id: string) => FAMILIES.find(([p]) => id.startsWith(p))?.[1] ?? id

// The fictional sample runner: 6 days a week, long run on Saturday, a few years of running, ~50 km now.
const SAMPLE_PROFILE: AthleteProfile = {
  v: 1, age: 35, weightKg: 68, heightCm: null, experience: 'intermediate', weeklyKm: 50,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const SAMPLE_GOALS: Record<Distance, SeasonGoal> = {
  marathon: { id: 'sample-marathon', kind: 'marathon', priority: 'A', name: 'Marathon in 3:29', date: '2027-04-25', confirmed: true, distanceKm: null, goalS: 3 * 3600 + 29 * 60, loops: null },
  half: { id: 'sample-half', kind: 'half', priority: 'A', name: 'Halbmarathon in 1:39', date: '2027-03-21', confirmed: true, distanceKm: null, goalS: 99 * 60, loops: null },
  '10k': { id: 'sample-10k', kind: '10k', priority: 'A', name: '10 km in 44:00', date: '2027-03-21', confirmed: true, distanceKm: null, goalS: 44 * 60, loops: null },
}
const SAMPLE_START = '2026-11-30'   // a Monday
const PHASE_LABEL: Record<string, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' }

export function sampleWeek(m: MethodologyFile): SampleWeek | null {
  const distance = (['marathon', 'half', '10k'] as Distance[]).find((d) => m.params.distances.includes(d))
  if (!distance) return null
  const goal = SAMPLE_GOALS[distance]
  const draft = generateDraft({
    goal, template: m.params, start: SAMPLE_START, profile: SAMPLE_PROFILE,
    measured: { currentKm: 50, currentKmSource: 'mean4', provenKm: 62, longest30Km: 18, longest30Source: 'measured', longest12mKm: distance === 'marathon' ? 30 : 21.1, recentRace: null },
  })
  if (!draft.ok) return null
  // A build-phase load week with key sessions, from the middle of the block (the most characteristic week).
  const weeks = draft.skeleton.weeks
  const build = weeks.filter((w) => w.phase === 'build' && w.kind === 'load')
  const pick = build[Math.floor(build.length / 2)] ?? weeks[Math.floor(weeks.length / 2)]
  const end = addDaysIso(pick.start, 6)
  const sessions = draft.workouts.sessions.filter((s) => s.date >= pick.start && s.date <= end)
  const byDate = new Map(sessions.map((s) => [s.date, s]))
  const days: SampleDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(pick.start, i)
    const s: PlanSession | undefined = byDate.get(date)
    return { date, type: s?.type ?? 'rest', km: s && s.type !== 'rest' ? s.km ?? 0 : 0, title: s?.title ?? 'Ruhetag', key: !!s?.key }
  })
  return { goal: goal.name, distance, phase: PHASE_LABEL[pick.phase] ?? pick.phase, km: Math.round(days.reduce((a, d) => a + d.km, 0)), days }
}

function addDaysIso(d: string, n: number) {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

let cache: MethodEntry[] | null = null
export function methodCatalogue(): MethodEntry[] {
  if (cache) return cache
  cache = listMethodologies().valid.map((m) => {
    const p = m.params
    return {
      id: m.id, name: m.meta.name, family: familyOf(m.id), distances: m.meta.distances, summary: m.meta.summary,
      sources: m.meta.sources, body: m.bodyMarkdown,
      facts: {
        taperWeeks: Math.max(...Object.values(p.phases.taper.weeks).map(Number)), runs: p.week.runs,
        longShare: p.week.long_run.share, longMaxKm: p.week.long_run.max_km, rampMax: p.volume.ramp_max, easyBuild: p.intensity.build.easy,
      },
      week: sampleWeek(m),
    }
  })
  return cache
}

export const methodById = (id: string) => methodCatalogue().find((m) => m.id === id) ?? null
