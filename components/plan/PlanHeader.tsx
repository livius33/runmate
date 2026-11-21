import { differenceInCalendarDays, parseISO, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { fmtPace, fmtClock } from '@/lib/plan/format'
import Link from 'next/link'
import { activeBlock, blocks, weekOf } from '@/lib/plan/blocks'
import { Chip } from '@/components/ui/chip'

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
      <div className="h-14 w-14 shrink-0 grid place-items-center rounded-card bg-brand text-title-sm text-white">
        {race.code}
      </div>
      <div className="min-w-0">
        <h1 className="text-title sm:text-display">{`${race.name} Plan`}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
          <span>Renntag</span>
          <Chip tone="brand">
            {format(parseISO(race.date), 'd. MMMM yyyy', { locale: de })}
          </Chip>
          <span className="ml-1.5">Woche</span>
          <Chip tone="teal" className="tabular-nums">
            {weekIdx > 0 ? weekIdx : '–'}/{raceWeeks.length}
          </Chip>
          <span className="ml-1.5">Ziel</span>
          <Chip className="tabular-nums text-foreground">
            {fmtClock(race.goalS)} · {fmtPace(race.goalPaceS)}/km
          </Chip>
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-display tabular-nums">
          {daysLeft > 0 ? daysLeft : daysLeft === 0 ? 'Heute' : '✓'}
        </div>
        <div className="text-caption text-muted-foreground">{daysLeft > 0 ? 'Tage bis zum Start' : daysLeft === 0 ? 'Renntag' : 'gelaufen'}</div>
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
      <div className="h-14 w-14 shrink-0 grid place-items-center rounded-card bg-teal text-title-sm text-white">GL</div>
      <div className="min-w-0">
        <h1 className="text-title sm:text-display">Grundlage</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
          <span>Woche</span>
          <Chip tone="teal" className="tabular-nums">{idx > 0 ? idx : '–'}</Chip>
          <span className="ml-1.5">Nächster Block</span>
          {next ? (
            <Chip tone="brand">
              {next.race.shortName} ab {format(parseISO(next.planStart), 'd. MMMM', { locale: de })}
            </Chip>
          ) : <Link href="/plan/neu" className="text-brand hover:underline">noch nicht geplant</Link>}
        </div>
      </div>
      {next && (
        <div className="ml-auto text-right">
          <div className="text-display tabular-nums">{differenceInCalendarDays(parseISO(next.planStart), parseISO(today))}</div>
          <div className="text-caption text-muted-foreground">Tage bis zum Blockstart</div>
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
      <div className="h-14 w-14 shrink-0 grid place-items-center rounded-card bg-teal text-title-sm text-white">
        {block.race.code}
      </div>
      <div className="min-w-0">
        <h1 className="text-title sm:text-display">{`Erholung nach ${block.race.shortName}`}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
          <span>Woche</span>
          <Chip tone="teal" className="tabular-nums">
            {idx > 0 ? `${idx}/${blocks.length}` : today > block.end ? 'fertig' : '–'}
          </Chip>
          <Chip tone="brand">{`${block.race.shortName} ✓`}</Chip>
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-display tabular-nums">✓</div>
        <div className="text-caption text-muted-foreground">gelaufen</div>
      </div>
    </div>
  )
}
