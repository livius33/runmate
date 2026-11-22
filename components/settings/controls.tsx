import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Form bits the ui primitives do not have yet (12-02), shaped like components/ui/field.tsx: a native select in the
// Input look and a checkbox row (box left, text right, the whole row clickable).
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return (
    <select ref={ref} className={cn('h-10 w-full rounded-control bg-card px-3 text-body-sm text-foreground shadow-hairline outline-none transition-shadow',
      'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', className)} {...props} />
  )
})

export function CheckRow({ className, children, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { children: React.ReactNode }) {
  return (
    <label className={cn('flex items-start gap-2', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...props} />
      {children}
    </label>
  )
}
