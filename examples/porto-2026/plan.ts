// Example: a hand-written training block — the final eleven weeks of a 3:05 build for the Porto Marathon 2026
// (8.11.2026), with taper and recovery. Runmate does not load it by default; see README.md in this folder for how to
// register it (the test suite does, tests/setup.ts). A plan file is plain data: weeks, day-by-day sessions, pacing
// splits, rules.

import type { PlanSession, PlanWeek, TrainingBlock } from '@/lib/plan/types'

export const RACE = {
  name: 'Porto Marathon',
  shortName: 'Porto',
  code: 'POR',
  date: '2026-11-08',
  distanceKm: 42.195,
  goalS: 3 * 3600 + 5 * 60,        // 3:05:00
  goalPaceS: 263,                  // 4:23/km
  fallbackS: 3 * 3600 + 10 * 60,   // 3:10:00
  fallbackPaceS: 270,              // 4:30/km
  startTime: '08:00',              // check against the race documents
  arrival: '2026-11-07',           // travel to the race
  gpxPath: '/porto-marathon.gpx',  // copy examples/porto-2026/porto-marathon.gpx to public/ to see the course map
  courseLabel: 'Streckenverlauf 2024',   // update when the 2026 course GPX is published
}

// The window this plan owns. Earlier dates keep using the plan stored in the DB, if any.
export const PLAN_START = '2026-09-28'

export const WEEKS: PlanWeek[] = [
  { kw: 38, start: '2026-09-14', end: '2026-09-20', km: 32,  focus: 'Leichte Woche' },
  { kw: 39, start: '2026-09-21', end: '2026-09-27', km: 72.5, focus: '2 Tempoeinheiten, Longrun entfallen' },
  { kw: 40, start: '2026-09-28', end: '2026-10-04', km: 105, focus: 'Sa: 30 km mit 15 km @ 4:23', key: true },
  { kw: 41, start: '2026-10-05', end: '2026-10-11', km: 100, focus: 'Sa: 28 km mit 10 km @ 4:23' },
  { kw: 42, start: '2026-10-12', end: '2026-10-18', km: 112, focus: 'Fr: Generalprobe', key: true },
  { kw: 43, start: '2026-10-19', end: '2026-10-25', km: 88,  focus: 'So: Hella-HM als finaler Test @ 4:23', key: true, holiday: true },
  { kw: 44, start: '2026-10-26', end: '2026-11-01', km: 70,  focus: 'Taper 1', taper: true },
  { kw: 45, start: '2026-11-02', end: '2026-11-08', km: 30,  focus: 'Taper 2 + Marathon', taper: true },
  { kw: 46, start: '2026-11-09', end: '2026-11-15', km: 15,  focus: 'Erholung 1/3: viel Ruhe', recovery: true },
  { kw: 47, start: '2026-11-16', end: '2026-11-22', km: 35,  focus: 'Erholung 2/3: locker zurück', recovery: true },
  { kw: 48, start: '2026-11-23', end: '2026-11-29', km: 50,  focus: 'Erholung 3/3: Steigerungen, lockerer Longrun', recovery: true },
]

// Last day of the recovery block after the race; the next block is not planned yet.
export const RECOVERY_END = '2026-11-29'

export const SESSIONS: PlanSession[] = [
  // KW40 — from the artifact
  { date: '2026-09-28', type: 'easy',      km: 20, title: 'Lockerer Dauerlauf', notes: 'Ersatz-Longrun für die ausgefallene Einheit' },
  { date: '2026-09-29', type: 'tempo',     km: 18, title: 'Renntempo-Blöcke', pace: '4:23', key: true,
    notes: '4 ein → 3 × 4 km @ 4:23 (1 km Trabpause) → 2 aus. Dritter Block unter HF 168 → 3:05-Kurs; über 172 → letzten Block auf 4:30.' },
  { date: '2026-09-30', type: 'easy',      km: 14, title: 'Ruhiger Lauf', notes: 'Zone 2' },
  { date: '2026-10-01', type: 'easy',      km: 13, title: 'Lockerer Lauf', notes: 'Wird Dienstag schwer: streichen, Woche landet bei 92.' },
  { date: '2026-10-02', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-10-03', type: 'long',      km: 30, title: 'Longrun mit Renntempo', pace: '4:23', key: true,
    notes: '10 locker → 15 km @ 4:23 → 5 ausrollen. Verpflegung üben: 60–90 g KH/h.' },
  { date: '2026-10-04', type: 'recovery',  km: 10, title: 'Regeneration' },

  // KW41 — 100 km
  { date: '2026-10-05', type: 'easy',      km: 13, title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-10-06', type: 'tempo',     km: 17, title: 'Schwelle', pace: '4:15', key: true,
    notes: '3 ein → 2 × 5 km @ 4:15 (1 km Trab) → 3 aus. Nur auf erholten Beinen.' },
  { date: '2026-10-07', type: 'easy',      km: 14, title: 'Ruhiger Lauf', notes: 'Zone 2' },
  { date: '2026-10-08', type: 'easy',      km: 15, title: 'Lockerer Lauf', notes: 'Mit 6 Steigerungen am Ende' },
  { date: '2026-10-09', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-10-10', type: 'long',      km: 28, title: 'Longrun mit Renntempo', pace: '4:23', key: true,
    notes: '10 locker → 10 km @ 4:23 → 8 ausrollen. Verpflegung wie am Renntag.' },
  { date: '2026-10-11', type: 'recovery',  km: 13, title: 'Regeneration' },

  // KW42 — 112 km, Generalprobe on Friday
  { date: '2026-10-12', type: 'easy',      km: 20, title: 'Lockerer Dauerlauf', notes: 'Zone 2' },
  { date: '2026-10-13', type: 'easy',      km: 17, title: 'Lockerer Lauf', notes: 'Mit 8 Steigerungen. Bewusst kein harter Tag vor der Generalprobe.' },
  { date: '2026-10-14', type: 'easy',      km: 17, title: 'Ruhiger Lauf', notes: 'Zone 2' },
  { date: '2026-10-15', type: 'easy',      km: 13, title: 'Lockerer Lauf', notes: 'Kurz und locker, früh ins Bett' },
  { date: '2026-10-16', type: 'long',      km: 32, title: 'Generalprobe', pace: '4:23', key: true, test: 'Generalprobe',
    notes: '10 km locker → 20 km @ 4:23 → 2 km ausrollen. Alles wie am Renntag: Startzeit, Schuhe, Frühstück, Verpflegung. 20 km unter HF 170 → Start auf 3:05. Braucht es 175+ → 4:30 anlaufen, 3:10 ins Ziel.' },
  { date: '2026-10-17', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-10-18', type: 'tempo',     km: 13, title: 'Sonntag früh im Renntempo', pace: '4:23',
    notes: 'Früh starten wie am Renntag: 4 ein → 6 km @ 4:23 → 3 aus.' },

  // KW43 — 88 km, holiday week; Sunday: Hella-Halbmarathon as the final race-pace test
  { date: '2026-10-19', type: 'recovery',  km: 10, title: 'Regeneration' },
  { date: '2026-10-20', type: 'easy',      km: 16, title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-10-21', type: 'easy',      km: 15, title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-10-22', type: 'easy',      km: 13, title: 'Lockerer Lauf', notes: 'Mit 6 Steigerungen' },
  { date: '2026-10-23', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-10-24', type: 'easy',      km: 8,  title: 'Lockerer Lauf', notes: 'Kurz und locker vor dem Test, früh ins Bett' },
  { date: '2026-10-25', type: 'tempo',     km: 26.1, title: 'Hella-Halbmarathon', pace: '4:23', key: true, test: 'Finaler Test', anchor: true,
    notes: '3 ein → 21,1 km @ 4:23 → 2 aus. Finaler Test, alles wie in Porto: Frühstück, Schuhe, Gels (15 Min. vor dem Start, dann alle 5 km). Gleichmäßig 4:23, auch wenn es leicht läuft. Unter HF 170 → Start auf 3:05. Braucht es 175+ → 4:30 anlaufen, 3:10 ins Ziel.' },

  // KW44 — 70 km, taper 1
  { date: '2026-10-26', type: 'recovery',  km: 8,  title: 'Regeneration', notes: 'Nach dem Halbmarathon: ganz locker' },
  { date: '2026-10-27', type: 'easy',      km: 10, title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-10-28', type: 'tempo',     km: 15, title: 'Renntempo-Blöcke', pace: '4:23', key: true,
    notes: '3 ein → 2 × 4 km @ 4:23 (1 km Trab) → 3 aus' },
  { date: '2026-10-29', type: 'easy',      km: 11, title: 'Lockerer Lauf' },
  { date: '2026-10-30', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-10-31', type: 'long',      km: 16, title: 'Mittellanger Lauf', notes: 'Zone 2' },
  { date: '2026-11-01', type: 'tempo',     km: 10, title: 'Sonntag früh im Renntempo', pace: '4:23',
    notes: 'Früh starten wie am Renntag: 3 ein → 5 km @ 4:23 → 2 aus.' },

  // KW45 — 30 km, taper 2 + race
  { date: '2026-11-02', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-03', type: 'tempo',     km: 10, title: 'Kurze Renntempo-Erinnerung', pace: '4:23',
    notes: '3 ein → 2 × 2 km @ 4:23 (1 km Trab) → 2 aus' },
  { date: '2026-11-04', type: 'easy',      km: 8,  title: 'Lockerer Lauf' },
  { date: '2026-11-05', type: 'easy',      km: 5,  title: 'Lockerer Lauf' },
  { date: '2026-11-06', type: 'easy',      km: 4,  title: 'Lockerer Lauf', notes: 'Mit 3 Steigerungen' },
  { date: '2026-11-07', type: 'recovery',  km: 3,  title: 'Shakeout in Porto' },
  { date: '2026-11-08', type: 'race',      km: 42.2, title: 'Porto Marathon', pace: '4:23', key: true,
    notes: 'Ziel 3:05. Fallback 3:10 bei 4:30/km.' },

  // KW46 — 15 km, recovery 1/3: mostly rest
  { date: '2026-11-09', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-10', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-11', type: 'recovery',  km: 4,  title: 'Sehr lockerer Lauf', notes: '20–25 Min., so langsam wie nötig. Bei Schmerzen Pause.' },
  { date: '2026-11-12', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-13', type: 'recovery',  km: 5,  title: 'Sehr lockerer Lauf', notes: 'Locker, Puls unten. Bei Schmerzen Pause.' },
  { date: '2026-11-14', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-15', type: 'recovery',  km: 6,  title: 'Sehr lockerer Lauf', notes: 'Locker, Puls unten.' },

  // KW47 — 35 km, recovery 2/3: easy running back
  { date: '2026-11-16', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-17', type: 'easy',      km: 6,  title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-11-18', type: 'easy',      km: 7,  title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-11-19', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-20', type: 'easy',      km: 6,  title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-11-21', type: 'easy',      km: 8,  title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-11-22', type: 'easy',      km: 8,  title: 'Lockerer Lauf', notes: 'Zone 2' },

  // KW48 — 50 km, recovery 3/3: strides and an easy long run
  { date: '2026-11-23', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-24', type: 'easy',      km: 8,  title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-11-25', type: 'easy',      km: 9,  title: 'Lockerer Lauf mit Steigerungen', notes: 'Mit 4 Steigerungen' },
  { date: '2026-11-26', type: 'easy',      km: 7,  title: 'Lockerer Lauf', notes: 'Zone 2' },
  { date: '2026-11-27', type: 'rest',              title: 'Ruhetag' },
  { date: '2026-11-28', type: 'long',      km: 16, title: 'Lockerer Longrun', notes: 'Komplett Zone 2, kein Tempo' },
  { date: '2026-11-29', type: 'easy',      km: 10, title: 'Lockerer Lauf', notes: 'Zone 2' },
]

// Pacing plan for 3:05:00. Paces in s/km; the last section closes the gap to the goal time.
// Training paces of the Porto plan for the session editor (07-08). Data only: race pace and threshold as in the sessions,
// easy as in RULES; intervals = Daniels I pace for 3:05 (VDOT ≈ 52), the Porto plan itself has none.
export const PORTO_PACES: Record<string, string> = { easy: '5:45', threshold: '4:15', intervals_vo2: '3:55', race: '4:23' }

export const SPLITS = [
  { from: 0,    to: 5,      paceS: 267, hrCap: 160, focus: 'Ruhig anlaufen, Gruppe finden' },
  { from: 5,    to: 21.1,   paceS: 263, hrCap: 168, focus: 'Renntempo, entspannt' },
  { from: 21.1, to: 30,     paceS: 262, hrCap: 172, focus: 'Rhythmus halten, verpflegen' },
  { from: 30,   to: 38,     paceS: 263, hrCap: 176, focus: 'Konzentriert bleiben' },
  { from: 38,   to: 42.195, paceS: 0,   hrCap: null, focus: 'Alles, was da ist' },
].map((s, i, all) => {
  if (s.paceS) return s
  const used = all.slice(0, i).reduce((t, p) => t + (p.to - p.from) * p.paceS, 0)
  return { ...s, paceS: Math.floor((RACE.goalS - used) / (s.to - s.from)) }
})

export const RULES = [
  'Sonntag ist Regenerationstag. Longruns liegen auf Freitag oder Samstag.',
  'Sechs Läufe pro Woche, ein Ruhetag.',
  'Zwei harte Tage maximal, nie hintereinander.',
  'Lockere Läufe wirklich locker: HF 130–142, ca. 5:45/km.',
  'Verpflegung ab dem ersten Longrun üben: 60–90 g Kohlenhydrate pro Stunde.',
  'In den letzten vier Wochen zweimal sonntags früh und kurz im Renntempo — der Marathon ist ein Sonntag.',
]

export const STOP_RULES = [
  'HF im lockeren Lauf mehr als 8–10 Schläge über Normalwert → Einheit abbrechen.',
  'Symptome unterhalb des Halses, Fieber, Gliederschmerzen → Pause, ohne Ausnahme.',
  'Tempoeinheit nur auf erholten Beinen. Auf müden trainiert man Erschöpfungstoleranz, nicht Schwelle.',
]

export const LEVERS = [
  { title: 'Schlaf', text: 'Bei 90–100 km/Woche der größte einzelne Hebel. Ziel: 7 bis 8,5 Stunden. Uhr nachts tragen.' },
]

// The block for registerBuiltInBlocks() (lib/plan/blocks.ts).
export const PORTO_2026: TrainingBlock = {
  id: 'porto-2026',
  goalId: 'porto-2026',             // its season goal (lib/season/goals.ts planGoals)
  handWritten: true,
  paces: PORTO_PACES,
  race: { ...RACE, splits: SPLITS },   // race-day pacing travels with the block (07-15)
  planStart: PLAN_START,
  end: RECOVERY_END,
  weeks: WEEKS,
  sessions: SESSIONS,
  rules: RULES,
  stopRules: STOP_RULES,
  levers: LEVERS,
}
