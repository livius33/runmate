'use client'

// Dialog shell (DESIGN.md ex-modal-card): a bottom sheet on phones, a centred card from sm up, at most 560 px wide.
// Radix Dialog gives the focus trap, Esc, aria-modal and the focus return. The body scrolls if it must; the footer
// (the action) stays visible below it. rounded.lg (12 px), Level 5 elevation.
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DialogShell({ open = true, onOpenChange, title, description, closeLabel = 'Schließen', footer, className, children }: {
  open?: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  closeLabel?: string
  footer?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-foreground/40" />
        <Dialog.Content {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn('fixed z-[1210] flex flex-col bg-card text-card-foreground shadow-overlay outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-dialog pb-[env(safe-area-inset-bottom)]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(35rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-dialog sm:pb-0',
            className)}>
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-5">
            <div className="min-w-0">
              <Dialog.Title className="text-body font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-caption text-muted-foreground">{description}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label={closeLabel}
              className="tap -mr-1.5 -mt-1 rounded-control p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3 sm:px-5">{children}</div>
          {footer && <div className="shrink-0 border-t border-border px-4 py-3 sm:px-5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
