'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { activeBlock } from '@/lib/plan/blocks'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { Card } from './ui'

const BRAND = 'hsl(358 75% 59%)'
const PLAN = 'hsl(220 9% 62%)'

export function VolumeCard({ today, actuals }: { today: string; actuals: Map<string, DayActual> }) {
  const active = activeBlock(today)
  const block = active.weeks.filter((w) => w.start >= active.planStart)
  const blockKm = block.reduce((t, w) => t + w.km, 0)
  const data = active.weeks.map((w) => {
    const started = w.start <= today
    const km = [...actuals.values()].filter((a) => a.date >= w.start && a.date <= w.end).reduce((t, a) => t + a.km, 0)
    return {
      label: `KW ${w.kw}`,
      focus: w.focus,
      plan: w.km,
      ist: started ? Math.round(km * 10) / 10 : null,
      current: w.start <= today && today <= w.end,
    }
  })

  return (
    <Card title="Wochenumfang" aside={
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px]" style={{ borderColor: PLAN }} />Plan</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BRAND }} />Garmin</span>
      </div>
    }>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={-18} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} content={<VolumeTooltip />} />
            <Bar dataKey="plan" barSize={18} fill="transparent" stroke={PLAN} strokeWidth={1.5} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="ist" barSize={18} fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Rahmen = geplante km, Füllung = synchronisierte Läufe. Blockvolumen KW {block[0].kw}–{block[block.length - 1].kw}: {blockKm} km.</p>
    </Card>
  )
}

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; focus: string; plan: number; ist: number | null } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-semibold">{d.label}</div>
      <div className="text-muted-foreground">{d.focus}</div>
      <div className="mt-1 tabular-nums">Plan {d.plan} km · Garmin {d.ist != null ? `${d.ist} km` : '–'}</div>
    </div>
  )
}
