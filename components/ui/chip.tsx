import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Small labels (DESIGN.md badge-secondary in the control radius, 6 px): session types, states, figures. Colour roles:
// teal = on plan / done, brand = today and key sessions, warning = needs a look, solid = the one emphasised label.
// race is ink too: small white text on brand red stays under 4.5 : 1.
export const chipVariants = cva('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-control px-2 text-caption font-medium', {
  variants: {
    tone: {
      outline: 'bg-card text-muted-foreground shadow-hairline',
      neutral: 'bg-secondary text-muted-foreground',
      brand: 'bg-brand-soft text-brand-text',
      teal: 'bg-teal-soft text-teal-text',
      warning: 'bg-warning-soft text-warning',
      solid: 'bg-foreground text-background',
      race: 'bg-foreground text-background',
    },
  },
  defaultVariants: { tone: 'outline' },
})

export function Chip({ tone, className, children, ...props }: VariantProps<typeof chipVariants> & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(chipVariants({ tone }), className)} {...props}>{children}</span>
}

// A chip that toggles (filters, period pickers, segmented choices): ink when selected.
export const ChipButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }>(
  function ChipButton({ selected, className, type, ...props }, ref) {
    return (
      <button ref={ref} type={type ?? 'button'} aria-pressed={selected}
        className={cn('tap inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-control px-3 text-caption font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          selected ? 'bg-foreground text-background' : 'bg-card text-muted-foreground shadow-hairline hover:text-foreground', className)}
        {...props} />
    )
  })
