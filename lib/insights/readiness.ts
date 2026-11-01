// Rennbereitschaft: is the runner ready for the race of today's block? One rated line per criterion, each with what the
// number means and what follows. Limits, HR and texts follow the race's distance (07-20). Pure.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { hrZones, isRacePaceWork, raceHr } from '@/lib/analytics/hr'
import { projectForm, trimp } from '@/lib/analytics/load'
import { activeBlock, inRaceWindow, raceOf } from '@/lib/plan/blocks'
import { type PlanSession, type RaceInfo } from '@/lib/plan/types'
import { estimateDurationS, fmtClock, fmtKm, fmtPace, paceToS, qualityKm } from '@/lib/plan/format'
import { athlete } from '@/lib/athlete'
import { weekOf } from '@/lib/plan/blocks'
import { dayLabel } from '@/lib/plan/effective'
import { matchSessionRuns, qualityBlock, type DatedRun } from '@/lib/plan/pace-check'
import { rulesFor } from '@/lib/plan/rules'
import type { RacePrediction } from './prediction'
import { planTests, testResult } from '@/lib/plan/race-day'

export type ReadinessTone = 'ok' | 'warn' | 'bad' | 'open'
export interface ReadinessLine { tone: ReadinessTone; label: string; text: string }
export type ReadinessVerdict = 'Auf Kurs' | 'Mit Fragezeichen' | 'Kritisch'

const VOLUME_OK = 0.9
const VOLUME_WARN = 0.75
// Longest run of the block: ok / warn from (marathon: 30 / 25 km).
const LONG_KM = (d: number) => (d > 30 ? { ok: 30, warn: 25 } : d > 15 ? { ok: 18, warn: 15 } : { ok: 12, warn: 10 })
const raceWord = (r: RaceInfo, a = 'den') => (r.distanceKm > 30 ? `${a} Marathon` : r.distanceKm > 15 ? `${a} Halbmarathon` : `${fmtKm(r.distanceKm)} km`)
const ACWR_OK = 1.3
const ACWR_LOW = 0.8
// Fresh on race day: the usual range for an A race after a 2-week taper.
const RACE_TSB = [10, 25] as const
const zoneMid = (i: number) => (hrZones()[i].min + hrZones()[i].max) / 2

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')
const de = (n: number, digits = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

// Estimated load (TRIMP) of a planned session: quality km at their target HR, the rest in Z2.
export function plannedLoad(s: PlanSession): number {
  if (s.type === 'rest' || !s.km) return 0
  const race = raceOf(s.date)
  if (s.type === 'race') return trimp(race.goalS, race.distanceKm > 30 ? athlete().pb.hr : raceHr(race.distanceKm).cap - 2)
  const total = estimateDurationS(s)
  if (!s.pace) return trimp(total, zoneMid(1))
  const q = qualityKm(s), qS = q * paceToS(s.pace)
  const qHr = isRacePaceWork(paceToS(s.pace), race) ? raceHr(race.distanceKm).cap - 5 : zoneMid(3)
  return trimp(qS, qHr) + trimp(Math.max(0, total - qS), zoneMid(1))
}

export function raceReadiness({ today, sessions, runs, prediction, fitness, acwr }: {
  today: string
  sessions: PlanSession[]
  runs: DatedRun[]
  prediction: RacePrediction
  fitness: { date: string; ctl: number; atl: number; tsb: number }[]
  acwr: number | null
}): { verdict: ReadinessVerdict; lines: ReadinessLine[]; note?: string } {
  const lines: ReadinessLine[] = []
  const block = activeBlock(today)
  const { acwrRed: ACWR_RED, tsbRed: TSB_RED } = rulesFor(today)   // the red zone of today's block
  const race = block.race
  const blockRuns = runs.filter((r) => r.date >= block.planStart && r.date <= today)
  const ranToday = blockRuns.some((r) => r.date === today)
  const taper = !!weekOf(today)?.taper

  // 1. Volume since the block start (today counts once it is run)
  const counted = sessions.filter((s) => s.date >= block.planStart && s.type !== 'race' && (s.date < today || (s.date === today && ranToday)))
  const planned = counted.reduce((t, s) => t + (s.type === 'rest' ? 0 : s.km ?? 0), 0)
  const done = blockRuns.reduce((t, r) => t + r.km, 0)
  if (planned > 0) {
    const share = done / planned, pct = Math.round(share * 100)
    const base = `${fmtKm(done)} von ${fmtKm(planned)} geplanten km seit Blockstart ${dayLabel(block.planStart)} (${pct} %)`
    lines.push(share >= VOLUME_OK
      ? { tone: 'ok', label: 'Umfang', text: `${base}: du liegst im Plan.` }
      : share >= VOLUME_WARN
        ? { tone: 'warn', label: 'Umfang', text: `${base}: etwas unter Plan. Nicht nachholen, einfach weiterlaufen.` }
        : { tone: 'bad', label: 'Umfang', text: `${base}: deutlich unter Plan. Die Grundlage für ${fmtClock(race.goalS)} wird knapp.` })
  }

  // 2. Longest run in the block
  const longest = [...blockRuns].sort((a, b) => b.km - a.km)[0]
  const { ok: LONG_OK, warn: LONG_WARN } = LONG_KM(race.distanceKm)
  if (longest) {
    const base = `${fmtKm(longest.km)} km am ${dayLabel(longest.date)}`
    lines.push(longest.km >= LONG_OK
      ? { tone: 'ok', label: 'Längster Lauf', text: `${base}: die Distanz für ${raceWord(race)} ist da.` }
      : longest.km >= LONG_WARN
        ? { tone: 'warn', label: 'Längster Lauf', text: `${base}: ein Lauf über ${LONG_OK} km fehlt noch (die Generalprobe bringt ihn).` }
        : { tone: 'bad', label: 'Längster Lauf', text: `${base}: für ${raceWord(race, 'einen')} zu kurz, ein langer Lauf über ${LONG_OK} km fehlt.` })
  }

  // 3. Race-pace tests: Generalprobe and the final test (follow moves; paired swap-aware).
  // A missed test is only critical when no later test can stand in for it.
  const hr = raceHr(race.distanceKm)
  const tests = planTests(sessions.filter((s) => inRaceWindow(s.date, race)))
  tests.forEach((t, i) => {
    const label = t.test!
    const b = testResult(t, sessions, runs, today).block
    const later = tests.slice(i + 1).some((x) => x.date >= today)
    if (t.date >= today && !b) {
      lines.push({ tone: 'open', label, text: `steht an am ${dayLabel(t.date)}: ${fmtKm(qualityKm(t))} km @ ${t.pace} unter HF ${hr.cap} → Start auf ${fmtClock(race.goalS)}.` })
    } else if (!b) {
      lines.push(later
        ? { tone: 'warn', label, text: `am ${dayLabel(t.date)} nicht gelaufen: der nächste Test entscheidet.` }
        : { tone: 'bad', label, text: `am ${dayLabel(t.date)} nicht gelaufen: der wichtigste Test vor ${race.shortName} fehlt.` })
    } else {
      const seen = `${fmtKm(b.km)} km in ${fmtPace(b.paceS)} bei HF ${b.hr ?? '–'}`
      lines.push(b.hr != null && b.hr < hr.cap
        ? { tone: 'ok', label, text: `${seen}: Start auf ${fmtClock(race.goalS)}.` }
        : b.hr != null && b.hr >= hr.hard
          ? { tone: 'bad', label, text: `${seen}: ${fmtPace(race.fallbackPaceS)} anlaufen, Ziel ${fmtClock(race.fallbackS)}.` }
          : { tone: 'warn', label, text: `${seen}: Grenzbereich, vorsichtig mit ${fmtPace(race.goalPaceS + 3)} anlaufen.` })
    }
  })

  // 4. Race pace evidence (Zielzeit-Prognose)
  if (prediction.timeS != null) {
    const tone: ReadinessTone = prediction.verdict === 'realistisch' ? 'ok' : prediction.verdict === 'offen' ? 'warn' : 'bad'
    lines.push({ tone, label: 'Renntempo', text: `Prognose ${fmtClock(prediction.timeS, true)}: ${prediction.text}.` })
  } else {
    lines.push({ tone: 'open', label: 'Renntempo', text: 'noch kein Renntempo-Block in den letzten 6 Wochen.' })
  }

  // 5. Load (ACWR) and form (TSB) now, each explained
  if (acwr != null && acwr > 0) {
    const pct = Math.round((acwr - 1) * 100)
    const base = `${de(acwr)}: ${pct >= 0 ? `${pct} % mehr` : `${-pct} % weniger`} als deine übliche Woche`
    lines.push(acwr > ACWR_RED
      ? { tone: 'bad', label: 'Belastung', text: `${base}. Verletzungsrisiko erhöht: Umfang drosseln.` }
      : acwr > ACWR_OK
        ? { tone: 'warn', label: 'Belastung', text: `${base}. Ab ${de(ACWR_RED, 1)} steigt das Verletzungsrisiko: die nächsten Tage locker halten.` }
        : acwr < ACWR_LOW
          ? { tone: taper ? 'ok' : 'warn', label: 'Belastung', text: `${base}.${taper ? ' Im Taper gewollt.' : ' Deutlich weniger als üblich.'}` }
          : { tone: 'ok', label: 'Belastung', text: `${base}: im Rahmen.` })
  }
  const now = fitness[fitness.length - 1]
  if (now) {
    const t = Math.round(now.tsb)
    const base = `TSB ${signed(t)} (Fitness minus Ermüdung)`
    lines.push(t < TSB_RED
      ? { tone: 'bad', label: 'Form', text: `${base}: sehr müde. Erholung zuerst.` }
      : t < -10
        ? { tone: taper ? 'warn' : 'ok', label: 'Form', text: `${base}: müde${taper ? ', im Taper mehr Ruhe.' : ', normal in einer Aufbauwoche.'}` }
        : t < 5
          ? { tone: 'ok', label: 'Form', text: `${base}: neutral.` }
          : { tone: 'ok', label: 'Form', text: `${base}: frisch.` })

    // 6. Form on race day, projected with the planned sessions
    const loads = new Map(sessions.filter((s) => s.date > today && s.date < race.date).map((s) => [s.date, plannedLoad(s)]))
    const todaySession = sessions.find((s) => s.date === today)
    const raceTsb = Math.round(projectForm(now, loads, race.date, !ranToday && todaySession ? plannedLoad(todaySession) : 0))
    const [lo, hi] = RACE_TSB
    const base2 = `TSB ${signed(raceTsb)} am ${dayLabel(race.date)}, wenn du den Plan läufst (Ziel ${signed(lo)} bis ${signed(hi)})`
    lines.push(raceTsb >= lo && raceTsb <= hi
      ? { tone: 'ok', label: 'Form am Renntag', text: `${base2}: frisch am Start.` }
      : raceTsb > hi
        ? { tone: 'warn', label: 'Form am Renntag', text: `${base2}: sehr ausgeruht, etwas Spritzigkeit kann fehlen.` }
        : raceTsb >= 0
          ? { tone: 'warn', label: 'Form am Renntag', text: `${base2}: knapp frisch, in der letzten Woche wirklich ruhig bleiben.` }
          : { tone: 'bad', label: 'Form am Renntag', text: `${base2}: noch müde am Start, der Taper reicht so nicht.` })
  }

  const bad = lines.filter((l) => l.tone === 'bad').length
  const warn = lines.filter((l) => l.tone === 'warn').length
  const verdict: ReadinessVerdict = bad >= 2 ? 'Kritisch' : bad >= 1 || warn >= 2 ? 'Mit Fragezeichen' : 'Auf Kurs'
  // The decision rule under the card.
  const note = `Entscheidung: der zuletzt gelaufene Renntempo-Test zählt. Unter HF ${hr.cap} → Start auf ${fmtClock(race.goalS)}. Ab HF ${hr.hard} → ${fmtPace(race.fallbackPaceS)} anlaufen und ${fmtClock(race.fallbackS)} ins Ziel bringen.`
  return { verdict, lines, note }
}
