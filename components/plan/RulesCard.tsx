import { activeBlock } from '@/lib/plan/blocks'
import { Card, Inset } from '@/components/ui/card'

export function RulesCard({ today }: { today: string }) {
  const { rules, stopRules, levers } = activeBlock(today)
  return (
    <Card title="Regeln" className="h-full">
      <ul className="space-y-2 text-body-sm">
        {rules.map((r) => (
          <li key={r} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />{r}</li>
        ))}
      </ul>

      <h3 className="mb-2 mt-4 text-body-sm font-semibold text-brand">Abbruchkriterien</h3>
      <ul className="space-y-2 text-body-sm">
        {stopRules.map((r) => (
          <li key={r} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />{r}</li>
        ))}
      </ul>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {levers.map((l) => (
          <Inset key={l.title}>
            <div className="text-body-sm font-semibold">{l.title}</div>
            <p className="mt-1 text-caption text-muted-foreground">{l.text}</p>
          </Inset>
        ))}
      </div>
    </Card>
  )
}
