'use client'

import { format, parseISO } from 'date-fns'
import { raceOf } from '@/lib/plan/blocks'
import { fmtClock, fmtPace } from '@/lib/plan/format'
import type { RacePrediction } from '@/lib/insights/prediction'
import { cn } from '@/lib/utils'
import { Card } from './ui'

const TONE = {
  realistisch: 'bg-teal-soft text-teal',
  offen: 'bg-amber-50 text-amber-700',
  langsamer: 'bg-brand-soft text-brand',
} as const

// Conservative finish-time estimate from race-pace blocks, with the evidence it rests on.
export function PredictionCard({ prediction, today }: { prediction: RacePrediction; today: string }) {
  const p = prediction
  const race = raceOf(today)
  return (
    <Card title="Zielzeit-Prognose" aside={<span className="text-xs text-muted-foreground">aus Renntempo-Blöcken</span>}>
      {p.timeS == null ? (
        <p className="text-sm text-muted-foreground">Noch kein Renntempo-Block in den letzten 6 Wochen.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{fmtClock(p.timeS, true)}</span>
            <span className="pb-1 text-sm text-muted-foreground tabular-nums">{fmtClock(p.lowS!, true)}–{fmtClock(p.highS!, true)}</span>
            <span className={cn('mb-1 rounded-full px-2.5 py-0.5 text-xs font-medium', TONE[p.verdict!])}>{p.text}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Ziel {fmtClock(race.goalS)} ({fmtPace(race.goalPaceS)}/km) · Fallback {fmtClock(race.fallbackS)} ({fmtPace(race.fallbackPaceS)}/km)
          </p>
          <ul className="mt-4 grid gap-1.5 text-sm tabular-nums">
            {p.blocks.map((b) => (
              <li key={b.date} className="flex flex-wrap justify-between gap-x-3">
                <span className="min-w-0">
                  <span className="text-muted-foreground">{format(parseISO(b.ranOn), 'd.M.')}</span> {b.title}
                </span>
                <span className="text-muted-foreground">
                  {b.km} km in {fmtPace(b.paceS)}{b.hr != null ? ` · HF ${b.hr}` : ' · ohne HF'} → <span className="font-medium text-foreground">{fmtPace(b.estPaceS)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Annahmen: Blocktempo + 1,5 s/km je Schlag über 168 (kein Bonus darunter) + Ermüdung (Intervalle 10 s, kurze Blöcke 5 s,
            ab 15 km 0 s). Trainings-Bestzeiten zählen nicht.
          </p>
        </>
      )}
    </Card>
  )
}
