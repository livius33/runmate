import { AlertTriangle, Check, Clock, Sparkles, X } from 'lucide-react'
import type { ReadinessLine, ReadinessTone, ReadinessVerdict } from '@/lib/insights/readiness'
import type { RecoveryVerdict } from '@/lib/insights/recovery'
import type { BaseVerdict } from '@/lib/insights/base'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'

const ICON: Record<ReadinessTone, { icon: typeof Check; tone: string }> = {
  ok: { icon: Check, tone: 'text-teal' },
  warn: { icon: AlertTriangle, tone: 'text-warning' },
  bad: { icon: X, tone: 'text-brand' },
  open: { icon: Clock, tone: 'text-muted-foreground' },
}

const VERDICT_TONE: Record<ReadinessVerdict | RecoveryVerdict | BaseVerdict, 'teal' | 'warning' | 'brand' | 'neutral'> = {
  'Auf Kurs': 'teal',
  'Mit Fragezeichen': 'warning',
  Kritisch: 'brand',
  'Noch offen': 'neutral',
  'Erholung läuft': 'teal',
  'Etwas zu viel': 'warning',
  'Erholung beendet': 'neutral',
  'Grundlage läuft': 'teal',
  'Mehr als geplant': 'warning',
}

// Ready for the race? A verdict and one explained line per criterion. After the race the same card
// shows the recovery block (title and note passed in).
export function ReadinessCard({ verdict, lines, title = 'Rennbereitschaft', note, className }: {
  verdict: ReadinessVerdict | RecoveryVerdict | BaseVerdict
  lines: ReadinessLine[]
  title?: string
  note?: string
  className?: string
}) {
  return (
    <Card title={title} aside={<Chip tone={VERDICT_TONE[verdict]}>{verdict}</Chip>} className={className}>
      <ul className="grid gap-2 text-body-sm">
        {lines.map((l) => {
          const { icon: Icon, tone } = ICON[l.tone]
          return (
            <li key={l.label} className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
              <span className="min-w-0"><b>{l.label}:</b> {l.text}</span>
            </li>
          )
        })}
      </ul>
      {note && <div className="mt-3 flex gap-2.5 rounded-card bg-teal-soft px-3 py-2.5 text-body-sm text-foreground/80">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
        <p>{note}</p>
      </div>}
    </Card>
  )
}
