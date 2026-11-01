'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { fmtNum, fmtPace, percentile } from './format'

export interface SimilarRun { id: string; date: string; km: number; paceS: number | null; hr: number | null; effMpb: number | null }

type Metric = 'effMpb' | 'paceS' | 'hr'
const METRICS: { key: Metric; label: string; better: 'up' | 'down'; fmt: (v: number) => string; unit: string }[] = [
  { key: 'effMpb', label: 'Effizienz', better: 'up', fmt: (v) => fmtNum(v, 2), unit: 'm/Schlag' },
  { key: 'paceS', label: 'Pace', better: 'down', fmt: fmtPace, unit: '/km' },
  { key: 'hr', label: 'Ø HF', better: 'down', fmt: (v) => String(Math.round(v)), unit: 'bpm' },
]

const W = 1000, H = 240, L = 50, R = 16, T = 14, B = 28
const DAY = 86_400_000

export function Comparison({ runId, runType, km, similar }: { runId: string; runType: string; km: number; similar: SimilarRun[] }) {
  const router = useRouter()
  const [metric, setMetric] = useState<Metric>('effMpb')
  const [hover, setHover] = useState<SimilarRun | null>(null)
  const M = METRICS.find((m) => m.key === metric)!

  const pts = similar.filter((s) => s[metric] != null).map((s) => ({ ...s, t: parseISO(s.date).getTime(), v: s[metric] as number }))
  const me = pts.find((p) => p.id === runId)
  if (pts.length < 3 || !me) {
    return <p className="text-sm text-muted-foreground">Noch zu wenige vergleichbare Läufe ({runType}, {fmtNum(km * 0.8, 0)}–{fmtNum(km * 1.2, 0)} km) für einen Vergleich.</p>
  }

  const t0 = Math.min(...pts.map((p) => p.t)) - 20 * DAY, t1 = Math.max(...pts.map((p) => p.t)) + 20 * DAY
  const vs = pts.map((p) => p.v).sort((a, b) => a - b)
  // Axis from the typical range; glitchy outliers (e.g. a broken HR strap) sit on the edge.
  const p5 = Math.min(percentile(vs, 0.05), me.v), p95 = Math.max(percentile(vs, 0.95), me.v)
  const pad = (p95 - p5) * 0.15 || 1
  const lo = p5 - pad, hi = p95 + pad
  const x = (t: number) => L + ((W - L - R) * (t - t0)) / (t1 - t0)
  // Pace and HR: lower is better, so flip the axis to keep "better" at the top.
  const flip = M.better === 'down'
  const y = (v: number) => { const f = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return T + (H - T - B) * (flip ? f : 1 - f) }

  // Least-squares trend over the last 12 months (or all, if fewer points)
  const recent = pts.filter((p) => p.t >= me.t - 365 * DAY && p.t <= t1)
  const tr = recent.length >= 3 ? recent : pts
  const mx = tr.reduce((a, p) => a + p.t, 0) / tr.length, my = tr.reduce((a, p) => a + p.v, 0) / tr.length
  const den = tr.reduce((a, p) => a + (p.t - mx) ** 2, 0)
  const slope = den ? tr.reduce((a, p) => a + (p.t - mx) * (p.v - my), 0) / den : 0
  const trendAt = (t: number) => my + slope * (t - mx)
  const trStart = Math.min(...tr.map((p) => p.t)), trEnd = Math.max(...tr.map((p) => p.t))

  const sorted = [...pts].sort((a, b) => (M.better === 'up' ? b.v - a.v : a.v - b.v))
  const rank = sorted.findIndex((p) => p.id === runId) + 1
  const median = vs[Math.floor(vs.length / 2)]
  const vsTrend = me.v - trendAt(me.t)
  const betterThanTrend = M.better === 'up' ? vsTrend > 0 : vsTrend < 0
  const yearTicks = Array.from(new Set(pts.map((p) => new Date(p.t).getFullYear())))
  const perMonth = slope * 30 * DAY

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Kennzahl">
          {METRICS.map((m) => (
            <button key={m.key} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}
              className={cn('rounded-full border px-3 py-1 text-xs', metric === m.key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />andere {runType}-Läufe</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" />dieser Lauf</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-teal" />Trend 12 Monate</span>
        </div>
      </div>

      <div className="min-h-[18px] text-xs text-muted-foreground tabular-nums">
        {hover ? <>{format(parseISO(hover.date), 'd. MMM yyyy', { locale: de })} · {fmtNum(hover.km, 1)} km · {fmtPace(hover.paceS)} /km · HF {hover.hr ?? '–'} · {hover.effMpb != null ? fmtNum(hover.effMpb, 2) : '–'} m/Schlag · Klick öffnet den Lauf</>
          : `Oben ist besser. ${pts.length} ${runType}-Läufe mit ${fmtNum(km * 0.8, 0)}–${fmtNum(km * 1.2, 0)} km.`}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${M.label} vergleichbarer Läufe über die Zeit`}>
        {[p5, (p5 + p95) / 2, p95].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{M.fmt(v)}</text>
          </g>
        ))}
        {yearTicks.map((yr) => { const t = new Date(yr, 0, 1).getTime(); return t > t0 && t < t1 && (
          <g key={yr}>
            <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} stroke="hsl(var(--border))" strokeDasharray="2 4" />
            <text x={x(t) + 4} y={H - 8} className="fill-muted-foreground text-[11px]">{yr}</text>
          </g>
        ) })}
        <line x1={x(trStart)} y1={y(trendAt(trStart))} x2={x(trEnd)} y2={y(trendAt(trEnd))} stroke="hsl(var(--teal))" strokeWidth={2} />
        {pts.map((p) => p.id !== runId && (
          <circle key={p.id} cx={x(p.t)} cy={y(p.v)} r={hover?.id === p.id ? 6.5 : 5} fill="hsl(var(--muted-foreground) / 0.4)"
            stroke="hsl(var(--card))" strokeWidth={1.5} className="cursor-pointer"
            onPointerEnter={() => setHover(p)} onPointerLeave={() => setHover(null)} onClick={() => router.push(`/running/activities/${p.id}`)} />
        ))}
        <circle cx={x(me.t)} cy={y(me.v)} r={7.5} fill="hsl(var(--brand))" stroke="hsl(var(--card))" strokeWidth={2}
          onPointerEnter={() => setHover(me)} onPointerLeave={() => setHover(null)} />
      </svg>

      <p className="rounded-xl bg-secondary/60 px-3.5 py-2.5 text-sm">
        {M.label}: <b>{M.fmt(me.v)} {M.unit}</b>, Platz <b>{rank} von {pts.length}</b> (Mittel {M.fmt(median)}).
        {' '}{betterThanTrend ? 'Besser' : 'Schwächer'} als dein Trend zu diesem Zeitpunkt
        {tr === recent && Math.abs(perMonth) > 0 && <> · Trend: {M.better === 'up' ? (perMonth > 0 ? 'steigend' : 'fallend') : (perMonth < 0 ? 'besser werdend' : 'schlechter werdend')}</>}.
      </p>
    </div>
  )
}
