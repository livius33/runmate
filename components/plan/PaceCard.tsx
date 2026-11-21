'use client'

import { addDays, format, parseISO } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { activeBlock } from '@/lib/plan/blocks'
import { type PlanSession } from '@/lib/plan/types'
import { fmtPace } from '@/lib/plan/format'
import { athlete } from '@/lib/athlete'
import { checkPace, matchSessionRuns, type DatedRun, type PaceCheck } from '@/lib/plan/pace-check'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { TypeTag } from './tags'

const RANGE_S = 30   // strip chart: ±30 s/km
const KIND_LABEL: Record<PaceCheck['kind'], string> = {
  quality: 'schnellste km des Blocks',
  whole: 'ganzer Lauf',
  easy: 'ganzer Lauf, locker',
}

export function PaceCard({ today, sessions, actuals }: { today: string; sessions: PlanSession[]; actuals: Map<string, DayActual> }) {
  const past = sessions.filter((s) => s.date >= activeBlock(today).planStart && s.date <= today && s.type !== 'rest')
  const runs: DatedRun[] = [...actuals.values()].flatMap((a) => a.runs.map((r) => ({ ...r, date: a.date })))
  const matched = matchSessionRuns(past, runs)
  const rows = [...past].reverse().map((s) => {
    const run = matched.get(s.date) ?? null
    return { s, c: checkPace(s, run), ranOn: run && run.date !== s.date ? run.date : null }
  })

  const onTarget = rows.filter((r) => r.c.verdict === 'im Ziel').length
  const done = rows.filter((r) => r.c.verdict !== 'kein Lauf').length
  // Last 7 days up front (at least the 3 latest sessions); everything older one tap away.
  const since = format(addDays(parseISO(today), -6), 'yyyy-MM-dd')
  const split = Math.max(Math.min(3, rows.length), rows.filter((r) => r.s.date >= since).length)
  const recent = rows.slice(0, split)
  const older = rows.slice(split)
  const olderOnTarget = older.filter((r) => r.c.verdict === 'im Ziel').length

  return (
    <Card title="Tempo: Plan vs. Ist" aside={done > 0 && <span className="tabular-nums">{onTarget} von {done} im Ziel</span>}>
      {rows.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">Noch keine absolvierten Einheiten im Plan.</p>
      ) : (
        <>
          <ul className="grid gap-3 text-body-sm tabular-nums">
            {recent.map((r) => <Row key={r.s.date} {...r} />)}
          </ul>
          {older.length > 0 && (
            <details className="group mt-3 border-t border-border pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
                Ältere Einheiten ({older.length}) · <span className="tabular-nums">{olderOnTarget} im Ziel</span>
              </summary>
              <ul className="mt-3 grid gap-3 text-body-sm tabular-nums">
                {older.map((r) => <Row key={r.s.date} {...r} />)}
              </ul>
            </details>
          )}
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              So liest du die Punkte
            </summary>
            <p className="mt-2 text-caption text-muted-foreground">
              Punkt = Abweichung vom Zieltempo in s/km (links schneller). Band = ±5 s im Ziel. Lockere Läufe zählen erst ab 15 s schneller als zu schnell, langsamer ist immer im Ziel. Getauschte Tage (±1) werden erkannt.
            </p>
          </details>
        </>
      )}
    </Card>
  )
}

function Row({ s, c, ranOn }: { s: PlanSession; c: PaceCheck; ranOn: string | null }) {
  return (
    <li className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-3">
      <span className="pt-0.5 text-muted-foreground">{format(parseISO(s.date), 'd.M.')}</span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <TypeTag type={s.type} />
          <span className={cn('min-w-0 truncate', s.key && 'font-medium')}>{s.title}</span>
        </div>
        <div className="mt-0.5 text-caption text-muted-foreground">
          Ziel {fmtPace(c.targetS)} · Ist {c.actualS != null ? fmtPace(c.actualS) : '–'}
          {c.actualS != null && <> ({KIND_LABEL[c.kind]})</>}
          {c.blockHr != null && <> · Block-HF <span className={c.blockHr >= athlete().raceHrCap ? 'text-brand' : undefined}>{c.blockHr}</span></>}
          {c.hr && c.hr.avg != null && <> · Ø HF <span className={c.hr.avg > c.hr.cap ? 'text-brand' : undefined}>{c.hr.avg}</span> / {c.hr.cap}</>}
          {ranOn && <> · gelaufen am {format(parseISO(ranOn), 'd.M.')}</>}
        </div>
      </div>
      <Strip c={c} />
    </li>
  )
}

function Strip({ c }: { c: PaceCheck }) {
  if (c.deltaS == null) return <span className="pt-0.5 text-caption text-muted-foreground">kein Lauf</span>
  const W = 150, H = 22, pad = 6
  const x = (d: number) => pad + ((Math.max(-RANGE_S, Math.min(RANGE_S, d)) + RANGE_S) / (2 * RANGE_S)) * (W - 2 * pad)
  const ok = c.verdict === 'im Ziel'
  return (
    <span className="flex items-center justify-end gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="hidden h-[22px] w-[96px] shrink-0 min-[420px]:block" role="img" aria-label={`${c.deltaS} Sekunden pro km`}>
        <rect x={x(-5)} width={x(5) - x(-5)} y={4} height={H - 8} rx={3} fill="hsl(var(--teal))" opacity={0.15} />
        <line x1={pad} x2={W - pad} y1={H / 2} y2={H / 2} stroke="hsl(var(--border))" />
        <line x1={x(0)} x2={x(0)} y1={3} y2={H - 3} stroke="hsl(var(--muted-foreground))" />
        <circle cx={x(c.deltaS)} cy={H / 2} r={5} fill={ok ? 'hsl(var(--teal))' : 'hsl(var(--brand))'} />
      </svg>
      <span className={cn('w-[44px] whitespace-nowrap text-right text-caption font-medium', ok ? 'text-teal' : 'text-brand')}>
        {c.deltaS > 0 ? '+' : c.deltaS < 0 ? '−' : '±'}{Math.abs(c.deltaS)} s
      </span>
    </span>
  )
}
