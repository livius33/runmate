import { AlertTriangle, Check, X } from 'lucide-react'
import type { InsightLine, InsightTone } from '@/lib/insights/run'
import { cn } from '@/lib/utils'
import { Panel } from './format'

const ICON: Record<InsightTone, { icon: typeof Check; tone: string }> = {
  ok: { icon: Check, tone: 'text-teal' },
  warn: { icon: AlertTriangle, tone: 'text-amber-700' },
  bad: { icon: X, tone: 'text-brand' },
}

// The run in a few rated sentences: plan, intensity, drift, comparison.
export function RunInsights({ lines, hasMetrics }: { lines: InsightLine[]; hasMetrics: boolean }) {
  return (
    <Panel title="Fazit" className="border-l-4 border-l-brand">
      {!hasMetrics ? (
        <p className="text-sm text-muted-foreground">Noch keine Detaildaten, erneut synchronisieren.</p>
      ) : (
        <ul className="grid gap-2 text-sm">
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
    </Panel>
  )
}
