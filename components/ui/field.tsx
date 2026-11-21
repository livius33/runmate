import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// DESIGN.md form-input: white, hairline ring, rounded.sm (6 px), 40 px high (32 px for `small`), 14 px text
// (16 px on phones, see globals.css). An invalid field gets the error ring.
const control = 'w-full rounded-control bg-card px-3 text-body-sm text-foreground shadow-hairline outline-none transition-shadow ' +
  'placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ' +
  'aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-error'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { small?: boolean }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ small, className, ...props }, ref) {
  return <input ref={ref} className={cn(control, small ? 'h-8 px-2' : 'h-10', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'resize-y py-2', className)} {...props} />
})

// Label, the control, then a hint or the error. Pass the control's id as `id`; the control should carry
// `aria-describedby={fieldDescribedBy(id, error, hint)}` and `aria-invalid={!!error}`.
export function Field({ id, label, optional, hint, error, className, children }: {
  id: string
  label: React.ReactNode
  optional?: React.ReactNode   // e.g. "(optional)"
  hint?: React.ReactNode
  error?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-body-sm font-medium">
        {label}{optional && <span className="font-normal text-muted-foreground"> {optional}</span>}
      </label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="text-caption text-error">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export const fieldDescribedBy = (id: string, error?: unknown, hint?: unknown) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined
