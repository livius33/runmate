// Feedback rules (07-25, research feedback.md §2): thresholds and windows on the Porto plan, and how Plan anpassen
// turns the "easy too hard" signal into a suggestion (never a faster pace, never automatic).
import { describe, expect, it } from 'vitest'
import { FEEDBACK_RULES, feedbackHints, feedbackSignals, storedWeekFeedback, tooHard, weekEntryFor, type FeedbackInput, type FeedbackRun } from '@/lib/feedback/rules'
import { effectiveSessions } from '@/lib/plan/effective'
import { periodFor, suggestions, type WorkshopInput } from '@/lib/plan/workshop'
import { paceToS } from '@/lib/plan/format'
import { RACE } from '@/examples/porto-2026/plan'
import { actualOf, easyPaceS, makeRun } from '../plan/arbitraries'

const TODAY = '2026-10-08'                    // Thu: Mon 5.10. easy, Tue 6.10. Schwelle 4:15, Wed 7.10. easy, Sat 10.10. Longrun @ 4:23
const sessions = effectiveSessions({})
const MP = paceToS('4:23')
const at = '2026-10-08T08:00:00.000Z'

const run = (date: string, o: Partial<FeedbackRun> & { km?: number; paceS?: number } = {}): FeedbackRun => ({
  ...makeRun(date, o.km ?? 12, o.paceS ?? easyPaceS, 150), rpe: null, feel: null, pain: null, ...o,
})
const signals = (runs: FeedbackRun[], extra: Partial<Parameters<typeof feedbackSignals>[0]> = {}, week?: FeedbackInput['week']) =>
  feedbackSignals({ today: TODAY, sessions, feedback: { runs, week }, ...extra })
const kinds = (...a: Parameters<typeof signals>) => signals(...a).map((s) => s.kind)

describe('Feedback: lockere Läufe zu anstrengend', () => {
  it('ein lockerer Tag ab RPE 6 oder Gefühl ≤ 2; RPE 5 nicht; harte Tage zählen nicht', () => {
    const easy = sessions.find((s) => s.date === '2026-10-05')
    const hard = sessions.find((s) => s.date === '2026-10-06')
    expect(tooHard(run('2026-10-05', { rpe: 6 }), easy)).toBe(true)
    expect(tooHard(run('2026-10-05', { rpe: 5 }), easy)).toBe(false)
    expect(tooHard(run('2026-10-05', { feel: 2 }), easy)).toBe(true)
    expect(tooHard(run('2026-10-05', { feel: 3 }), easy)).toBe(false)
    expect(tooHard(run('2026-10-06', { rpe: 9 }), hard)).toBe(false)
    expect(tooHard(run('2026-10-02', { rpe: 7 }), undefined)).toBe(true)          // a run on a free day is an easy day
  })
  it('zwei Signale in 7 Tagen → Signal; eines nicht; das Wochenfeedback (Müdigkeit ≥ 4) zählt als eines', () => {
    expect(kinds([run('2026-10-05', { rpe: 6 })])).toEqual([])
    const two = signals([run('2026-10-05', { rpe: 6 }), run('2026-10-07', { feel: 2 })])
    expect(two).toMatchObject([{ kind: 'easy-too-hard', dates: ['2026-10-05', '2026-10-07'], weekTired: false }])
    expect(two[0].why[0]).toContain('2 lockere Läufe')
    const week = { start: '2026-10-05', rating: 2 as const, fatigue: 4 as const, at }
    expect(signals([run('2026-10-05', { rpe: 6 })], {}, week)).toMatchObject([{ kind: 'easy-too-hard', weekTired: true }])
    expect(signals([run('2026-10-05', { rpe: 6 })], {}, { ...week, fatigue: 3 })).toEqual([])
    expect(signals([run('2026-10-05', { rpe: 4 })], {}, week)).toEqual([])          // the week alone never fires
  })
  it('Fenster: 7 Tage einschließlich heute; Longrun ohne Tempo erst ab RPE 7', () => {
    expect(kinds([run('2026-10-01', { rpe: 8 }), run('2026-10-07', { rpe: 8 })])).toEqual([])
    expect(kinds([run('2026-10-02', { rpe: 8 }), run('2026-10-07', { rpe: 8 })])).toEqual(['easy-too-hard'])
    const plain = effectiveSessions({ '2026-10-03': { date: '2026-10-03', type: 'long', km: 30, title: 'Longrun' } })
    const sig = (rpe: number) => feedbackSignals({ today: TODAY, sessions: plain, feedback: { runs: [run('2026-10-03', { km: 30, rpe }), run('2026-10-07', { rpe: 6 })] } })
    expect(sig(6)).toEqual([])
    expect(sig(FEEDBACK_RULES.longRpeHigh)).toMatchObject([{ kind: 'easy-too-hard' }])
  })
})

describe('Feedback: Schmerzen', () => {
  const pauses = { pauses: [{ id: 'p', kind: 'krank' as const, from: '2026-10-08', to: null }], today: TODAY }
  it('Stopp beim letzten Lauf (≤ 3 Tage) → Pause-Hinweis, nicht mit laufender Pause, nicht wenn ein späterer Lauf ohne Schmerzen war', () => {
    expect(signals([run('2026-10-07', { pain: 'stop' })])).toMatchObject([{ kind: 'pain-stop', date: '2026-10-07' }])
    expect(kinds([run('2026-10-07', { pain: 'stop' })], { pauses })).toEqual([])
    expect(kinds([run('2026-10-04', { pain: 'stop' })])).toEqual([])
    expect(kinds([run('2026-10-05', { pain: 'stop' }), run('2026-10-07', { pain: 'none' })])).toEqual([])
    const hints = feedbackHints(signals([run('2026-10-07', { pain: 'stop' })]))
    expect(hints).toMatchObject([{ kind: 'pain-stop', tone: 'warn', pause: true }])
    expect(hints[0].text).toContain('Krank/Pause')
  })
  it('leichte Schmerzen: ab 3 Läufen in 14 Tagen ein Hinweis', () => {
    const light = (dates: string[]) => dates.map((d) => run(d, { pain: 'light' }))
    expect(kinds(light(['2026-10-01', '2026-10-05']))).toEqual([])
    expect(kinds(light(['2026-09-24', '2026-10-01', '2026-10-05']))).toEqual([])   // 24.9. is outside the 14 days
    expect(kinds(light(['2026-09-25', '2026-10-01', '2026-10-05']))).toEqual(['pain-recurring'])
  })
})

describe('Feedback: Renntempo fühlt sich leicht an', () => {
  const goal = (date: string, rpe: number, paceS = MP) => run(date, { km: 18, paceS, rpe })
  it('zwei Renntempo-Einheiten im Ziel mit RPE ≤ 4 in 21 Tagen → Hinweis (nie ein Vorschlag)', () => {
    expect(kinds([goal('2026-09-29', 4), goal('2026-10-03', 3)])).toEqual(['goal-pace-easy'])
    expect(kinds([goal('2026-09-29', 4)])).toEqual([])
    expect(kinds([goal('2026-09-29', 5), goal('2026-10-03', 3)])).toEqual([])
    expect(kinds([goal('2026-09-29', 4, MP + 20), goal('2026-10-03', 3)])).toEqual([])   // too slow = not on target
    expect(kinds([goal('2026-09-29', 4, MP - 10), goal('2026-10-03', 3)])).toEqual(['goal-pace-easy'])
    expect(kinds([run('2026-10-06', { km: 17, paceS: paceToS('4:15'), rpe: 3 }), goal('2026-10-03', 3)])).toEqual([])  // threshold is not race pace
    const hint = feedbackHints(signals([goal('2026-09-29', 4), goal('2026-10-03', 3)]))[0]
    expect(hint).toMatchObject({ kind: 'goal-pace-easy', tone: 'ok' })
    expect(hint.text).toContain('der nächste Test entscheidet')
  })
})

describe('Feedback in Plan anpassen', () => {
  const events = [{ date: RACE.date, name: RACE.name }]
  const input = (feedback: FeedbackInput | undefined, tsb = 0): WorkshopInput => {
    const runs = feedback?.runs ?? []
    return { today: TODAY, period: periodFor({ kind: 'weeks', weeks: 2 }, TODAY, events), sessions, manual: {}, actual: actualOf(runs),
      fitness: { tsb, acwr: 1 }, events, profile: null, recent: null, feedback }
  }
  const flagged = { runs: [run('2026-10-05', { rpe: 7 }), run('2026-10-07', { rpe: 6 })] }
  it('zwei zu anstrengende lockere Läufe → "Longrun am Sa 10.10. locker laufen" mit Diff, 70 % der km, ohne Tempo', () => {
    const s = suggestions(input(flagged)).find((x) => x.kind === 'feedback-fatigue')!
    expect(s.title).toBe('Longrun mit Renntempo am Sa. 10.10. locker laufen')
    expect(s.diff).toHaveLength(1)
    expect(s.diff[0]).toMatchObject({ date: '2026-10-10', after: { type: 'easy', km: 19.5 } })
    expect(s.diff[0].after.pace).toBeUndefined()
    expect(s.why[0]).toContain('zu anstrengend')
    expect(s.diff[0].after.notes).toContain('nach deinem Feedback')
  })
  it('kein Doppel: in der roten Zone macht der Ermüdungsschutz den Vorschlag; ohne Feedback gibt es keinen', () => {
    const tired = suggestions(input(flagged, -30))
    expect(tired.map((x) => x.kind)).toContain('fatigue')
    expect(tired.map((x) => x.kind)).not.toContain('feedback-fatigue')
    expect(suggestions(input(undefined)).map((x) => x.kind)).not.toContain('feedback-fatigue')
    expect(suggestions(input({ runs: [run('2026-10-05', { rpe: 7 })] })).map((x) => x.kind)).not.toContain('feedback-fatigue')
  })
})

describe('Wochenfeedback lesen (07-26 schreibt es)', () => {
  it('nimmt nur gültige Einträge; diese Woche vor letzter Woche', () => {
    const raw = { v: 1, byWeek: { '2026-09-28': { rating: 3, fatigue: 4, at }, '2026-10-05': { rating: 4, fatigue: 2, note: ' ok ', at }, bad: { rating: 9, fatigue: 1, at }, '2026-09-21': { rating: 1 } } }
    const weeks = storedWeekFeedback(raw)
    expect(Object.keys(weeks).sort()).toEqual(['2026-09-28', '2026-10-05'])
    expect(weeks['2026-10-05']).toEqual({ rating: 4, fatigue: 2, note: 'ok', at })
    expect(weekEntryFor(weeks, '2026-10-08')).toMatchObject({ start: '2026-10-05', fatigue: 2 })
    expect(weekEntryFor({ '2026-09-28': weeks['2026-09-28'] }, '2026-10-08')).toMatchObject({ start: '2026-09-28', fatigue: 4 })
    expect(weekEntryFor({}, '2026-10-08')).toBeNull()
    expect(storedWeekFeedback(null)).toEqual({})
  })
})
