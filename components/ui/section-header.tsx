import { cn } from '@/lib/utils'

// A heading with an optional uppercase mono eyebrow above it and an aside on the right (figures, navigation, a chip).
// `level` picks the size: card (16 px, inside a card), section (20 px, between card groups), page (24 px, the page title).
const SIZE = {
  card: 'text-body font-semibold',
  section: 'text-title-sm',
  page: 'text-title',
} as const

export function SectionHeader({ title, eyebrow, aside, level = 'card', as, className }: {
  title: React.ReactNode
  eyebrow?: React.ReactNode
  aside?: React.ReactNode
  level?: keyof typeof SIZE
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}) {
  const H = as ?? (level === 'page' ? 'h1' : 'h2')
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-3 gap-y-1', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="font-mono text-caption uppercase text-muted-foreground">{eyebrow}</div>}
        <H className={SIZE[level]}>{title}</H>
      </div>
      {aside && <div className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">{aside}</div>}
    </div>
  )
}
