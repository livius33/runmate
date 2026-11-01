'use client'

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { ScopeReady } from '@/components/UserScope'

// Today's date in the runner's time zone, rendered in the browser (pages may be prerendered at build time).
export function HeaderDate({ className }: { className?: string }) {
  return <ScopeReady><DateText className={className} /></ScopeReady>
}

function DateText({ className }: { className?: string }) {
  const today = useToday()
  return <span className={cn('hidden lg:block text-xs text-muted-foreground tabular-nums', className)}>{format(parseISO(today), 'EEEE, d. MMMM yyyy', { locale: de })}</span>
}
