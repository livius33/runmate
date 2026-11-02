'use client'

// "Nächster Plan" (07-14): where the next plan is created. The Plan page shows it when the running block ends within six
// weeks and nothing follows; the Saison cards show the same status and button per race.
import Link from 'next/link'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Pill } from '@/components/plan/ui'
import type { GoalPlanStatus, PlanState } from '@/lib/plan/draft-store'

export type PlanStatusData = { status: GoalPlanStatus[]; activeEnd: string; activeName: string; nextBlockStart: string | null }

const SHOW_DAYS = 42
const STATE: Record<PlanState, { label: string; tone: string; action: string }> = {
  none: { label: 'kein Plan', tone: 'border-border text-muted-foreground', action: 'Plan erstellen' },
  draft: { label: 'Entwurf gespeichert', tone: 'border-amber-200 bg-amber-50 text-amber-700', action: 'Entwurf öffnen' },
  live: { label: 'Plan live', tone: 'border-teal/20 bg-teal-soft text-teal', action: 'Plan ansehen' },
}
const longDate = (d: string) => format(parseISO(d), 'EEEEEE. d. MMMM yyyy', { locale: de })

export function usePlanStatus() {
  return useQuery<PlanStatusData>({ queryKey: ['plan-status'], queryFn: () => fetch('/api/running/drafts?status=1').then((r) => r.json()) })
}

export const planHref = (s: GoalPlanStatus) => (s.state === 'live' ? '/plan' : `/plan/neu?goal=${s.goalId}${s.draftId ? `&draft=${s.draftId}` : ''}`)

export function PlanStatePill({ state }: { state: PlanState }) {
  return <Pill className={STATE[state].tone}>{STATE[state].label}</Pill>
}

export function PlanAction({ status, className }: { status: GoalPlanStatus; className?: string }) {
  if (status.state === 'live') return null
  return (
    <Link href={planHref(status)} className={cn('tap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
      status.state === 'none' ? 'bg-foreground text-background' : 'border border-border hover:bg-secondary', className)}>
      {STATE[status.state].action} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}

// Plan page: only when the running block ends soon and no block follows it.
export function NextPlanCard({ today }: { today: string }) {
  const { data } = usePlanStatus()
  if (!data || data.nextBlockStart) return null
  const left = differenceInCalendarDays(parseISO(data.activeEnd), parseISO(today))
  const next = data.status.find((s) => s.date > data.activeEnd)
  if (left < 0 || left > SHOW_DAYS || !next) return null
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">Nächster Plan</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Dein {data.activeName}-Block endet am {format(parseISO(data.activeEnd), 'd.M.', { locale: de })} ({left === 0 ? 'heute' : `in ${left} Tagen`}).
          Danach: <span className="font-medium text-foreground">{next.name}</span> am {longDate(next.date)}.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <PlanStatePill state={next.state} />
        <PlanAction status={next} />
      </div>
    </section>
  )
}
