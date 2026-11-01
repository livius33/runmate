import { AlertTriangle, Check, Clock, Sparkles, X } from 'lucide-react'
import type { ReadinessLine, ReadinessTone, ReadinessVerdict } from '@/lib/insights/readiness'
import type { RecoveryVerdict } from '@/lib/insights/recovery'
import type { BaseVerdict } from '@/lib/insights/base'
import { cn } from '@/lib/utils'
import { Card } from './ui'

const ICON: Record<ReadinessTone, { icon: typeof Check; tone: string }> = {
  ok: { icon: Check, tone: 'text-teal' },
  warn: { icon: AlertTriangle, tone: 'text-amber-700' },
  bad: { icon: X, tone: 'text-brand' },
  open: { icon: Clock, tone: 'text-muted-foreground' },
}

const VERDICT_TONE: Record<ReadinessVerdict | RecoveryVerdict | BaseVerdict, string> = {
  'Auf Kurs': 'bg-teal-soft text-teal',
  'Mit Fragezeichen': 'bg-amber-50 text-amber-700',
  Kritisch: 'bg-brand-soft text-brand',
  'Erholung läuft': 'bg-teal-soft text-teal',
  'Etwas zu viel': 'bg-amber-50 text-amber-700',
  'Erholung beendet': 'bg-secondary text-muted-foreground',
  'Grundlage läuft': 'bg-teal-soft text-teal',
  'Mehr als geplant': 'bg-amber-50 text-amber-700',
}

// Ready for the race? A verdict and one explained line per criterion. After the race the same card
// shows the recovery block (title and note passed in).
export function ReadinessCard({ verdict, lines, title = 'Rennbereitschaft', note }: {
  verdict: ReadinessVerdict | RecoveryVerdict | BaseVerdict
  lines: ReadinessLine[]
  title?: string
  note?: string
}) {
  return (
    <Card title={title} aside={<span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', VERDICT_TONE[verdict])}>{verdict}</span>}>
      <ul className="grid gap-2.5 text-sm">
        {lines.map((l) => {
          const { icon: Icon, tone } = ICON[l.tone]
          return (
            <li key={l.label} className="flex items-start gap-2">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
              <span className="min-w-0 leading-snug"><b>{l.label}:</b> {l.text}</span>
            </li>
          )
        })}
      </ul>
      {note && <div className="mt-4 flex gap-2.5 rounded-xl bg-teal-soft/50 px-3.5 py-3 text-sm text-foreground/80">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-teal" />
        <p>{note}</p>
      </div>}
    </Card>
  )
}
