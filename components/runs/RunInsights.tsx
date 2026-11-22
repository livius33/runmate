import { AlertTriangle, Check, X } from 'lucide-react'
import type { InsightLine, InsightTone } from '@/lib/insights/run'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

const ICON: Record<InsightTone, { icon: typeof Check; tone: string }> = {
  ok: { icon: Check, tone: 'text-teal' },
  warn: { icon: AlertTriangle, tone: 'text-warning' },
  bad: { icon: X, tone: 'text-brand' },
}

// The run in a few rated sentences: plan, intensity, drift, comparison.
export function RunInsights({ lines, hasMetrics, className }: { lines: InsightLine[]; hasMetrics: boolean; className?: string }) {
  return (
    <Card title="Fazit" className={className}>
      {!hasMetrics ? (
        <p className="text-body-sm text-muted-foreground">Noch keine Detaildaten, erneut synchronisieren.</p>
      ) : (
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
      )}
    </Card>
  )
}
