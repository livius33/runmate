import { cn } from '@/lib/utils'
import type { SessionType } from '@/lib/plan/types'

export function Card({ title, aside, className, children }: {
  title?: string
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('h-full rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

export const TYPE_LABEL: Record<SessionType, string> = {
  easy: 'Locker',
  recovery: 'Regeneration',
  tempo: 'Tempo',
  intervals: 'Intervalle',
  long: 'Longrun',
  rest: 'Ruhetag',
  race: 'Rennen',
}

const TYPE_TONE: Record<SessionType, string> = {
  easy: 'bg-teal-soft text-teal',
  recovery: 'bg-teal-soft text-teal',
  tempo: 'bg-brand-soft text-brand',
  intervals: 'bg-brand-soft text-brand',
  long: 'bg-amber-50 text-amber-700',
  rest: 'bg-secondary text-muted-foreground',
  race: 'bg-brand text-white',
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

export function TypeTag({ type }: { type: SessionType }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TYPE_TONE[type])}>
      {TYPE_LABEL[type]}
    </span>
  )
}

export function Stat({ label, value, unit, className }: { label: string; value: React.ReactNode; unit?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}
