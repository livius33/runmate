// Race week, day by day: what matters each day, carbs in grams, and a checklist with due days.
// Every race builds its week from its own block's sessions plus carbs per distance (07-15). Pure; amounts come from
// athlete().weightKg and the race.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { athlete } from '@/lib/athlete'
import { blockFor, raceOf } from './blocks'
import { gelPlan, racePlan } from './race-day'
import { fmtKm, fmtPace } from './format'
import { todayLocal } from '@/lib/dates'
import type { RaceInfo } from './types'

const round5 = (n: number) => Math.round(n / 5) * 5
const g = (lo: number, hi: number) => `${round5(athlete().weightKg * lo)}–${round5(athlete().weightKg * hi)} g`
const kg = () => athlete().weightKg.toLocaleString('de-DE')

export interface RaceWeekDay { date: string; title: string; focus: string[] }

export interface ChecklistItem { id: string; label: string; due: string }

// The checklist of every race; `dueDays` = days before the race (the ids are stored, app/api/running/race-checklist).
const CHECKLIST_ITEMS: { id: string; label: string; dueDays: number }[] = [
  { id: 'anreise', label: 'Anreise & Unterkunft bestätigt', dueDays: 4 },
  { id: 'schuhe', label: 'Schuhe & Rennkleidung gepackt', dueDays: 2 },
  { id: 'gels', label: 'Gels + 1 Reserve eingepackt', dueDays: 2 },
  { id: 'unterlagen', label: 'Startunterlagen abgeholt', dueDays: 1 },
  { id: 'startnummer', label: 'Startnummer & Chip befestigt', dueDays: 1 },
  { id: 'uhr', label: 'Uhr (und Kopfhörer) geladen', dueDays: 1 },
  { id: 'fruehstueck', label: 'Frühstück organisiert', dueDays: 1 },
  { id: 'wecker', label: 'Wecker gestellt', dueDays: 1 },
  { id: 'wetter', label: 'Wetter & Kleidung geprüft', dueDays: 1 },
]
export const CHECKLIST_IDS = CHECKLIST_ITEMS.map((c) => c.id)

export interface RaceWeek { race: RaceInfo; days: RaceWeekDay[]; checklist: ChecklistItem[]; wake: string; breakfast: string }

const DEFAULT_START = '09:00'
const shift = (start: string, min: number) => {
  const [h, m] = start.split(':').map(Number)
  const t = h * 60 + m + min
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

// The week before a race, built from the race's block.
export function raceWeek(race: RaceInfo = raceOf(todayLocal())): RaceWeek {
  const at = (n: number) => format(addDays(parseISO(race.date), n), 'yyyy-MM-dd')
  const start = race.startTime ?? DEFAULT_START
  const wake = shift(start, -195)
  const breakfast = shift(start, -180)
  const marathon = race.distanceKm > 40
  const sessions = blockFor(race.date)?.sessions ?? []
  const plan = racePlan('A', race)
  const gels = gelPlan(plan, false, race).gels.length
  const sessionLine = (date: string) => {
    const s = sessions.find((x) => x.date === date)
    if (!s || s.type === 'rest') return 'Ruhetag: viel schlafen, normal essen.'
    return `${fmtKm(s.km ?? 0)} km ${s.notes ?? s.title}`
  }
  const days: RaceWeekDay[] = []
  for (let n = -6; n <= 0; n++) {
    const date = at(n)
    const s = sessions.find((x) => x.date === date)
    const focus = n === 0 ? [] : [sessionLine(date)]
    if (n === -4) focus.push(`Wetter prüfen${race.arrival ? ', Anreise und Unterkunft bestätigen' : ''}.`)
    if (marathon && (n === -2 || n === -1)) focus.push(`${g(8, 10)} Kohlenhydrate über den Tag (8–10 g/kg bei ${kg()} kg), wenig Ballaststoffe und Fett.`)
    if (!marathon && n === -1) focus.push(`Kohlenhydratbetont essen: ${g(6, 8)} (6–8 g/kg), viel trinken.`)
    if (n === -2) focus.push('Tasche packen: Schuhe, Rennkleidung, Gels.')
    if (n === -1) focus.push('Startunterlagen abholen, Startnummer und Chip befestigen.', `Früh ins Bett, Wecker ${wake}.`)
    if (n === 0) focus.push(
      `Frühstück um ${breakfast}: ${g(2, 3)} Kohlenhydrate (2–3 g/kg), z. B. Weißbrot mit Honig, Banane.`,
      `Ein Gel 15 Minuten vor dem Start (${start}${race.startTime ? '' : ', Startzeit noch offen'}).`,
      `Die ersten ${fmtKm(plan[0].to)} km in ${fmtPace(plan[0].paceS)}, nicht schneller.`)
    const title = n === 0 ? 'Renntag' : marathon && n >= -2 ? `Carb-Loading Tag ${n + 3}` : s && s.type !== 'rest' ? s.title : 'Ruhetag'
    days.push({ date, title, focus })
  }
  const checklist: ChecklistItem[] = CHECKLIST_ITEMS.map(({ dueDays, ...c }) => ({
    ...c, due: at(-dueDays),
    ...(c.id === 'gels' ? { label: `${gels} Gels + 1 Reserve eingepackt` } : c.id === 'wecker' ? { label: `Wecker ${wake} gestellt` } : {}),
  }))
  return { race, days, checklist, wake, breakfast }
}

export type RaceWeekPhase = 'none' | 'preview' | 'week'

// Preview in the taper week before (7–13 days out), full card in race week (0–6 days out) — for the race of today's block.
export function raceWeekPhase(today: string, race: RaceInfo = raceOf(today)): RaceWeekPhase {
  const d = differenceInCalendarDays(parseISO(race.date), parseISO(today))
  return d >= 0 && d <= 6 ? 'week' : d >= 7 && d <= 13 ? 'preview' : 'none'
}

export const raceWeekDay = (date: string) => raceWeek(raceOf(date)).days.find((d) => d.date === date)
