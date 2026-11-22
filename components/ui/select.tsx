import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// A native select in the Input look (components/ui/field.tsx): white, hairline ring, rounded.sm (6 px), 40 px high
// like Input (32 px for `small`), 14 px text (16 px on phones, see globals.css), the same focus ring.
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { small?: boolean }

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ small, className, ...props }, ref) {
  return (
    <select ref={ref} className={cn('w-full min-w-0 rounded-control bg-card text-body-sm text-foreground shadow-hairline outline-none transition-shadow',
      'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', small ? 'h-8 px-2' : 'h-10 px-3', className)} {...props} />
  )
})

// A checkbox row: box left, text right, the whole row clickable.
export function CheckRow({ className, children, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { children: React.ReactNode }) {
  return (
    <label className={cn('flex items-start gap-2', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...props} />
      {children}
    </label>
  )
}
