// Go live (07-14): a draft becomes a training block — weeks, sessions with workouts, the race as anchor and RaceInfo
// from the season goal. A frozen block no longer follows template, profile or run changes; it is what the plan, the
// engine, the cards and the calendar read from then on. Pure.
import { HR_ZONES } from '@/lib/analytics/hr'
import { DEFAULT_STOP_RULES as STOP_RULES } from '../rules'
import type { SeasonGoal } from '@/lib/season/goals'
import type { RaceInfo, TrainingBlock } from '../types'
import { recoveryOf, type Draft } from './draft'
import { RACE_KM, fmtPace } from './paces'
import type { Methodology } from '../methodology/schema'
import { rulesFromTemplate } from '../rules'

const PLAN_B = 1.03                       // Plan B goal = goal + 3 % (e.g. 3:05 → 3:10)
const CODE: Record<string, string> = { marathon: 'MAR', half: 'HM', '10k': '10K' }

// `template` is the template as the draft used it (with Mein Ansatz): its adaptation rules go into the block (07-07).
export function freezeDraft(d: Draft, goal: SeasonGoal, templateName: string, template: Methodology): TrainingBlock {
  const D = RACE_KM[d.distance]
  // One race pace per block (07-20, decided 2026-10-26): Renntempo and Plan A are the pace the sessions use. From the
  // goal time that is the goal; from a threshold test or a recent race it is the current form (the draft warns when the
  // Saison goal is faster), and Plan A's time follows from it.
  const wishS = d.inputs.goalS.value ?? goal.goalS ?? 0
  const goalS = d.paces.source === 'goal_time' ? wishS : Math.round(d.paces.racePaceS * D)
  const fallbackS = Math.round((goalS * PLAN_B) / 60) * 60
  const race: RaceInfo = {
    name: goal.name, shortName: goal.name, code: CODE[d.distance], date: goal.date, distanceKm: D,
    goalS, goalPaceS: d.paces.source === 'goal_time' ? Math.round(goalS / D) : d.paces.racePaceS, fallbackS, fallbackPaceS: Math.round(fallbackS / D),
  }
  // The block ends with its recovery weeks after the race (07-22); drafts saved before carry none yet.
  const recovery = d.recovery ?? recoveryOf({ ...d, raceDate: goal.date })
  const weeks = [...d.days.weeks, ...recovery.weeks]
  const firstLoad = d.skeleton.weeks.findIndex((w) => w.kind === 'load')
  const runs = d.workouts.sessions.filter((s) => s.date >= weeks[Math.max(0, firstLoad)].start && s.date <= weeks[Math.max(0, firstLoad)].end
    && s.type !== 'rest' && (s.km ?? 0) > 0).length
  return {
    id: `gen-${goal.id}`,
    goalId: goal.id,
    race,
    planStart: weeks[0].start,
    end: weeks[weeks.length - 1].end,
    weeks,
    sessions: [...d.workouts.sessions.map((s) => (s.type === 'race' ? { ...s, title: goal.name, anchor: true } : s)), ...recovery.sessions],
    rules: [
      `Vorlage: ${templateName}. Spitze ${String(d.skeleton.peakKm).replace('.', ',')} km pro Woche.`,
      `${runs} Läufe pro Woche; Schlüsseleinheiten nie am Tag nach dem Longrun, nie drei harte Tage hintereinander.`,
      `Lockere Läufe wirklich locker: Puls ≤ ${HR_ZONES[1].max}, ca. ${d.paces.fmt.easy}/km.`,
      'Höchstens drei steigende Wochen am Stück, dann hält oder sinkt der Umfang; die letzten zwei Wochen vor dem Taper bleiben Belastung.',
      'Der Longrun wird nie mehr als 10 % länger als dein längster Lauf der letzten 30 Tage.',
      `Renntempo ${fmtPace(race.goalPaceS)}/km; Plan B ${fmtPace(race.fallbackPaceS)}/km.`,
    ],
    stopRules: STOP_RULES,
    levers: [{ title: 'Schlaf', text: 'Der größte einzelne Hebel bei steigendem Umfang: 7 bis 8,5 Stunden, Uhr nachts tragen.' }],
    engine: rulesFromTemplate(template, d.distance),
    paces: { ...d.paces.fmt, race: fmtPace(race.goalPaceS) },
  }
}

// German error, or null when the block may go live next to the existing blocks (built-in + live ones).
export function goLiveError(block: TrainingBlock, existing: TrainingBlock[], today: string): string | null {
  if (block.planStart <= today) return 'Der Plan muss in der Zukunft beginnen.'
  const clash = existing.find((b) => b.id !== block.id && block.planStart <= b.end && b.planStart <= block.end)
  if (clash) return `Überschneidet sich mit „${clash.race.name}“ (bis ${clash.end}). Start auf den Montag danach legen.`
  if (existing.some((b) => b.id === block.id)) return 'Für dieses Rennen ist schon ein Plan live: erst offline nehmen.'
  return null
}
