// Static sample data for the landing-page product panels (Phase 6). A fictional runner in a 12-week half-marathon
// block (goal 1:39), with one missed key session, a sick week and one fatigue-guard event — the same story the demo
// seed tells (Phase 5). Not a real person; labelled "Beispieldaten" wherever it is shown. App UI texts stay German.
import type { SessionType } from '@/lib/plan/types'

export const TODAY = {
  label: 'Heute · Donnerstag 12.3.',
  type: 'tempo' as SessionType,
  title: 'Schwelle 3 × 3 km',
  km: '12',
  targets: ['4:23 /km', 'Puls 168–176', '2 min Trabpause'],
  advice: 'Die Schwelle ist heute dran – gleichmäßig, nicht schneller als 4:20.',
  why: ['TSB −6: frisch genug', 'letzte harte Einheit vor 3 Tagen'],
  yesterday: 'Gestern: 8,4 km locker, Puls im Schnitt 138 – passt.',
}

// One week, plan vs. run (km). `run: null` = still to come.
export const WEEK = {
  title: 'KW 11 · Aufbau',
  planKm: 64,
  doneKm: 29,
  days: [
    { d: 'Mo', type: 'easy' as SessionType, plan: 9, run: 9.2 },
    { d: 'Di', type: 'intervals' as SessionType, plan: 11, run: 11.4 },
    { d: 'Mi', type: 'easy' as SessionType, plan: 8, run: 8.4 },
    { d: 'Do', type: 'tempo' as SessionType, plan: 12, run: null },
    { d: 'Fr', type: 'rest' as SessionType, plan: 0, run: null },
    { d: 'Sa', type: 'long' as SessionType, plan: 18, run: null },
    { d: 'So', type: 'recovery' as SessionType, plan: 6, run: null },
  ],
}

// The "final CTA" week: every day done.
const DONE = [9.2, 11.4, 8.4, 12.1, 0, 18.3, 6.2]
export const WEEK_DONE = WEEK.days.map((x, i) => ({ ...x, run: x.plan ? DONE[i] : null }))

// Plan changes log (engine): before → after, the rule, undo.
export const CHANGES = [
  { when: 'Mi 4.3.', title: 'Intervalle 6 × 1000 m', from: 'Di', to: 'Do', shift: 2, rule: 'Verpasste Schlüsseleinheit: höchstens 3 Tage später, mit 2 Tagen Abstand zur nächsten' },
  { when: 'Mo 9.3.', title: '4,5 km offen', from: 'Mi', to: 'Mo · Mi', shift: 1, rule: 'Offene km auf lockere Tage, höchstens 30 % bzw. 5 km pro Tag' },
  { when: 'Sa 14.3.', title: 'Schwelle → locker 8 km', from: 'Sa', to: 'Sa', shift: 0, rule: 'Ermüdung: TSB −27 unter −25, nächste harte Einheit 70 % locker' },
]

export const PAUSE = {
  title: 'Krank · 17.–21.2.',
  steps: [
    { label: 'Woche 1 zurück', value: '60 % Umfang, nur locker' },
    { label: 'Woche 2', value: '80 %, eine Qualitätseinheit' },
    { label: 'Danach', value: 'wieder nach Plan' },
  ],
}

export const FATIGUE = { tsb: -27, limit: -25, acwr: 1.32, text: 'Müde: Die Schwelle am Samstag wird ein lockerer Lauf (8 km). Am Montag geht es normal weiter.' }

// 12 weeks of the block: planned vs. run km (week 7 = sick, week 11 = this week).
export const BLOCK = [
  { w: 1, plan: 44, run: 45 }, { w: 2, plan: 47, run: 47 }, { w: 3, plan: 50, run: 48 }, { w: 4, plan: 42, run: 43 },
  { w: 5, plan: 52, run: 53 }, { w: 6, plan: 55, run: 51 }, { w: 7, plan: 57, run: 21 }, { w: 8, plan: 45, run: 44 },
  { w: 9, plan: 56, run: 56 }, { w: 10, plan: 58, run: 57 }, { w: 11, plan: 64, run: null }, { w: 12, plan: 40, run: null },
]

export const LONG_RUNS = [14, 15, 16, 14, 17, 18, 0, 15, 18, 19]
// Average pace in zone 2 (s/km) per week: same heart rate, faster.
export const Z2_PACE = [352, 350, 349, 347, 345, 344, 0, 346, 341, 338]

export const REVIEW = {
  title: 'Wochenrückblick KW 10',
  lines: ['57 von 58 km gelaufen', 'Beide Schlüsseleinheiten im Zieltempo', 'Longrun 19 km, die letzten 5 km im HM-Tempo'],
  next: 'Nächste Woche: gleicher Umfang, Schwelle wird um 1 km länger.',
}

// Race week (carbohydrates for 68 kg): grams per day.
export const RACE_WEEK = [
  { d: 'Mi', g: 340, note: 'normal' },
  { d: 'Do', g: 340, note: 'normal' },
  { d: 'Fr', g: 476, note: '7 g/kg' },
  { d: 'Sa', g: 544, note: '8 g/kg' },
  { d: 'So', g: 0, note: 'Rennen · Frühstück 2–3 h vorher' },
]

export const SPLITS = {
  a: { label: 'Plan A · 1:39:00', pace: '4:41', km: [['5 km', '23:28'], ['10 km', '46:56'], ['15 km', '1:10:23'], ['21,1 km', '1:39:00']] },
  b: { label: 'Plan B · 1:41:30', pace: '4:49', km: [['5 km', '24:03'], ['10 km', '48:07'], ['15 km', '1:12:10'], ['21,1 km', '1:41:30']] },
  decide: 'Plan B, wenn der Puls bei km 5 über 172 liegt oder es wärmer als 20 °C ist.',
}
