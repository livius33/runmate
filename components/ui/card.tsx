import { cn } from '@/lib/utils'
import { SectionHeader } from './section-header'

// DESIGN.md card-marketing / template-card in the app: white surface, rounded.md (8 px), Level 2 elevation (hairline
// ring + two small drops), 16 px inside on phones, 20 px from sm up. `title` and `aside` make the card's header.
export function Card({ title, aside, className, children, as: Tag = 'section' }: {
  title?: React.ReactNode
  aside?: React.ReactNode
  className?: string
  children: React.ReactNode
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag className={cn('min-w-0 rounded-card bg-card p-4 text-card-foreground shadow-raised sm:p-5', className)}>
      {title && <SectionHeader title={title} aside={aside} className="mb-3" />}
      {children}
    </Tag>
  )
}

// A quiet inset inside a card (DESIGN.md card-soft): secondary surface, no elevation.
export function Inset({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-card bg-secondary px-3 py-2.5', className)}>{children}</div>
}
