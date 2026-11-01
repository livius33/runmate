import { cn } from '@/lib/utils'
import type { RunType } from '@/lib/analytics/run-metrics'

// Value at a percentile of a sorted copy — for axis ranges that ignore glitchy outliers.
export function percentile(values: number[], p: number) {
  const v = [...values].sort((a, b) => a - b)
  return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))] : 0
}

export const fmtPace = (s: number | null | undefined) =>
  s == null || !Number.isFinite(s) ? '–' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export const fmtClock = (s: number) => {
  const r = Math.round(s), h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), sec = r % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const TONE: Record<RunType, string> = {
  Locker: 'bg-teal-soft text-teal',
  Regeneration: 'bg-teal-soft text-teal',
  Tempo: 'bg-brand-soft text-brand',
  Intervalle: 'bg-brand-soft text-brand',
  Rennen: 'bg-brand text-white',
  Longrun: 'bg-amber-50 text-amber-700',
  Laufband: 'bg-secondary text-muted-foreground',
}

export function RunTypeTag({ type, className }: { type: RunType; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE[type], className)}>
      {type}
    </span>
  )
}

export function Panel({ title, sub, children, className }: { title?: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4 sm:p-5 min-w-0 flex flex-col gap-3', className)}>
      {title && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      )}
      {children}
    </section>
  )
}
