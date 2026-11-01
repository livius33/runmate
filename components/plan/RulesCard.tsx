import { activeBlock } from '@/lib/plan/blocks'
import { Card } from './ui'

export function RulesCard({ today }: { today: string }) {
  const { rules, stopRules, levers } = activeBlock(today)
  return (
    <Card title="Regeln">
      <ul className="space-y-2 text-sm">
        {rules.map((r) => (
          <li key={r} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />{r}</li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-sm font-semibold text-brand">Abbruchkriterien</h3>
      <ul className="space-y-2 text-sm">
        {stopRules.map((r) => (
          <li key={r} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />{r}</li>
        ))}
      </ul>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {levers.map((l) => (
          <div key={l.title} className="rounded-xl bg-secondary/60 px-3.5 py-3">
            <div className="text-sm font-semibold">{l.title}</div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{l.text}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
