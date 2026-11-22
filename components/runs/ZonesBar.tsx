import { hrZones } from '@/lib/analytics/hr'
import { fmtClock } from './format'

// Zone colours: calm → hard, Z2 in the plan's teal because that's where easy running lives.
export const ZONE_COLORS = ['hsl(358 90% 88%)', 'hsl(var(--teal))', 'hsl(358 80% 72%)', 'hsl(358 75% 59%)', 'hsl(358 70% 38%)']

export function ZonesBar({ seconds }: { seconds: number[] }) {
  const total = seconds.reduce((a, b) => a + b, 0)
  if (!total) return <p className="text-body-sm text-muted-foreground">Keine Pulsdaten für diesen Lauf.</p>
  const pct = seconds.map((s) => Math.round((s / total) * 100))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-control" role="img"
        aria-label={hrZones().map((z, i) => `${z.name} ${pct[i]} %`).join(', ')}>
        {seconds.map((s, i) => s > 0 && (
          <div key={i} style={{ flex: s, background: ZONE_COLORS[i] }} title={`${hrZones()[i].name}: ${pct[i]} %`} />
        ))}
      </div>
      <ul className="grid gap-1.5 text-body-sm tabular-nums">
        {hrZones().map((z, i) => (
          <li key={z.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ZONE_COLORS[i] }} />
            <span>{z.name} {z.label} <span className="text-muted-foreground">{z.max >= 999 ? `ab ${z.min}` : z.min === 0 ? `unter ${z.max}` : `${z.min}–${z.max}`}</span></span>
            <span className="text-muted-foreground">{fmtClock(seconds[i])}</span>
            <span className="w-10 text-right font-medium">{pct[i]} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
