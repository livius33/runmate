'use client'

// "Nächster Plan" (07-14): where the next plan is created. The Plan page shows it when the running block ends within six
// weeks and nothing follows; the Saison cards show the same status and button per race.
import Link from 'next/link'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import type { GoalPlanStatus, PlanState } from '@/lib/plan/draft-store'

export type PlanStatusData = { status: GoalPlanStatus[]; activeEnd: string; activeName: string; nextBlockStart: string | null }

const SHOW_DAYS = 42
const STATE: Record<PlanState, { label: string; tone: 'outline' | 'warning' | 'teal'; action: string }> = {
  none: { label: 'kein Plan', tone: 'outline', action: 'Plan erstellen' },
  draft: { label: 'Entwurf gespeichert', tone: 'warning', action: 'Entwurf öffnen' },
  live: { label: 'Plan live', tone: 'teal', action: 'Plan ansehen' },
}
const longDate = (d: string) => format(parseISO(d), 'EEEEEE. d. MMMM yyyy', { locale: de })

export function usePlanStatus() {
  return useQuery<PlanStatusData>({ queryKey: ['plan-status'], queryFn: () => fetch('/api/running/drafts?status=1').then((r) => r.json()) })
}

export const planHref = (s: GoalPlanStatus) => (s.state === 'live' ? '/plan' : `/plan/neu?goal=${s.goalId}${s.draftId ? `&draft=${s.draftId}` : ''}`)

export function PlanStatePill({ state }: { state: PlanState }) {
  return <Chip tone={STATE[state].tone}>{STATE[state].label}</Chip>
}

export function PlanAction({ status, className }: { status: GoalPlanStatus; className?: string }) {
  if (status.state === 'live') return null
  return (
    <Link href={planHref(status)} className={cn(buttonVariants({ size: 'sm', variant: status.state === 'none' ? 'primary' : 'secondary' }), className)}>
      {STATE[status.state].action} <ArrowRight />
    </Link>
  )
}

// Plan page: only when the running block ends soon and no block follows it.
export function NextPlanCard({ today, className }: { today: string; className?: string }) {
  const { data } = usePlanStatus()
  if (!data || data.nextBlockStart) return null
  const left = differenceInCalendarDays(parseISO(data.activeEnd), parseISO(today))
  const next = data.status.find((s) => s.date > data.activeEnd)
  if (left < 0 || left > SHOW_DAYS || !next) return null
  return (
    <Card className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-body font-semibold">Nächster Plan</h2>
        <p className="mt-0.5 text-body-sm text-muted-foreground">
          Dein {data.activeName}-Block endet am {format(parseISO(data.activeEnd), 'd.M.', { locale: de })} ({left === 0 ? 'heute' : `in ${left} Tagen`}).
          Danach: <span className="font-medium text-foreground">{next.name}</span> am {longDate(next.date)}.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <PlanStatePill state={next.state} />
        <PlanAction status={next} />
      </div>
    </Card>
  )
}
