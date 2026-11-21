import { cn } from '@/lib/utils'

// A figure with its label (replaces the plan's Stat): label in caption, value in tabular figures, unit quiet.
// `size`: md 20 px (inside cards), lg 24 px (headline figures). `tone` colours the value only.
const TONE = { default: '', brand: 'text-brand', teal: 'text-teal', warning: 'text-warning', error: 'text-error' } as const

export function Figure({ label, value, unit, sub, tone = 'default', size = 'md', className }: {
  label: React.ReactNode
  value: React.ReactNode
  unit?: React.ReactNode
  sub?: React.ReactNode        // one quiet line under the value (comparison, range)
  tone?: keyof typeof TONE
  size?: 'md' | 'lg'
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="truncate text-caption text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 tabular-nums', size === 'lg' ? 'text-title' : 'text-title-sm', TONE[tone])}>
        {value}
        {unit && <span className="ml-1 text-caption font-normal tracking-normal text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-caption tabular-nums text-muted-foreground">{sub}</div>}
    </div>
  )
}
