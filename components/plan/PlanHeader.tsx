import { differenceInCalendarDays, parseISO, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { fmtPace, fmtClock } from '@/lib/plan/format'
import Link from 'next/link'
import { activeBlock, blocks, weekOf } from '@/lib/plan/blocks'
import { Pill } from './ui'

// Title, code and countdown come from the active block's race.
export function PlanHeader({ today }: { today: string }) {
  const block = activeBlock(today)
  const race = block.race
  const daysLeft = differenceInCalendarDays(parseISO(race.date), parseISO(today))
  const blockWeeks = block.weeks.filter((w) => w.start >= block.planStart)
  const raceWeeks = blockWeeks.filter((w) => !w.recovery)
  const current = weekOf(today)
  const weekIdx = current ? blockWeeks.findIndex((w) => w.kw === current.kw) + 1 : 0
  if (block.base) return <BaseHeader today={today} />
  if (daysLeft < 0) return <RecoveryHeader today={today} />

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="h-14 w-14 shrink-0 rounded-2xl bg-brand text-white grid place-items-center text-lg font-bold tracking-tight">
        {race.code}
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">{`${race.name} Plan`}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Renntag</span>
          <Pill className="border-brand/20 bg-brand-soft text-brand font-medium">
            {format(parseISO(race.date), 'd. MMMM yyyy', { locale: de })}
          </Pill>
          <span className="ml-2">Woche</span>
          <Pill className="border-teal/20 bg-teal-soft text-teal font-medium tabular-nums">
            {weekIdx > 0 ? weekIdx : '–'}/{raceWeeks.length}
          </Pill>
          <span className="ml-2">Ziel</span>
          <Pill className="font-medium text-foreground tabular-nums">
            {fmtClock(race.goalS)} · {fmtPace(race.goalPaceS)}/km
          </Pill>
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {daysLeft > 0 ? daysLeft : daysLeft === 0 ? 'Heute' : '✓'}
        </div>
        <div className="text-xs text-muted-foreground">{daysLeft > 0 ? 'Tage bis zum Start' : daysLeft === 0 ? 'Renntag' : 'gelaufen'}</div>
      </div>
    </div>
  )
}

// Between goal blocks: the rolling base block (07-17) and what comes next.
function BaseHeader({ today }: { today: string }) {
  const block = activeBlock(today)
  const idx = block.weeks.findIndex((w) => w.start <= today && today <= w.end) + 1
  const next = blocks().find((b) => !b.base && b.planStart > today)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="h-14 w-14 shrink-0 rounded-2xl bg-teal text-white grid place-items-center text-lg font-bold tracking-tight">GL</div>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">Grundlage</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Woche</span>
          <Pill className="border-teal/20 bg-teal-soft text-teal font-medium tabular-nums">{idx > 0 ? idx : '–'}</Pill>
          <span className="ml-2">Nächster Block</span>
          {next ? (
            <Pill className="border-brand/20 bg-brand-soft text-brand font-medium">
              {next.race.shortName} ab {format(parseISO(next.planStart), 'd. MMMM', { locale: de })}
            </Pill>
          ) : <Link href="/plan/neu" className="text-brand hover:underline">noch nicht geplant</Link>}
        </div>
      </div>
      {next && (
        <div className="ml-auto text-right">
          <div className="text-3xl font-semibold tabular-nums tracking-tight">{differenceInCalendarDays(parseISO(next.planStart), parseISO(today))}</div>
          <div className="text-xs text-muted-foreground">Tage bis zum Blockstart</div>
        </div>
      )}
    </div>
  )
}

// After the race: the recovery block instead of the countdown.
function RecoveryHeader({ today }: { today: string }) {
  const block = activeBlock(today)
  const blocks = block.weeks.filter((w) => w.recovery)
  const current = weekOf(today)
  const idx = current?.recovery ? blocks.findIndex((w) => w.kw === current.kw) + 1 : 0
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="h-14 w-14 shrink-0 rounded-2xl bg-teal text-white grid place-items-center text-lg font-bold tracking-tight">
        {block.race.code}
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">{`Erholung nach ${block.race.shortName}`}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Woche</span>
          <Pill className="border-teal/20 bg-teal-soft text-teal font-medium tabular-nums">
            {idx > 0 ? `${idx}/${blocks.length}` : today > block.end ? 'fertig' : '–'}
          </Pill>
          <Pill className="border-brand/20 bg-brand-soft text-brand font-medium">{`${block.race.shortName} ✓`}</Pill>
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">✓</div>
        <div className="text-xs text-muted-foreground">gelaufen</div>
      </div>
    </div>
  )
}
