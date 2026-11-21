import { cn } from '@/lib/utils'

// The Runmate mark: a route that climbs to a finish dot, on the brand red. Same drawing as app/icon.svg.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('h-6 w-6 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="hsl(var(--brand))" />
      <path d="M7.5 23c4 0 4.5-6.5 8.5-6.5s4.5-6 8-6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="7.5" cy="23" r="2" fill="hsl(var(--brand))" stroke="#fff" strokeWidth="1.6" />
      <circle cx="24" cy="10.5" r="3" fill="#fff" />
    </svg>
  )
}

// `compact`: the wordmark only from sm up, the header is full on phones.
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-body-sm font-semibold text-foreground', compact && 'hidden sm:inline')}>Runmate</span>
    </span>
  )
}
