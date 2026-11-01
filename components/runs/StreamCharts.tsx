'use client'

import { useMemo, useState } from 'react'
import { fmtNum, fmtPace } from './format'

export interface StreamPoint { km: number; pace: number | null; hr: number | null; alt: number | null; cad: number | null }

const W = 640, L = 44, R = 10

interface Spec {
  key: 'pace' | 'hr' | 'alt'
  label: string
  height: number
  color: string
  invert?: boolean
  area?: boolean
  fmt: (v: number) => string
}

const SPECS: Spec[] = [
  { key: 'pace', label: 'Pace /km', height: 120, color: 'hsl(var(--brand))', invert: true, fmt: fmtPace },
  { key: 'hr', label: 'Herzfrequenz', height: 110, color: 'hsl(var(--foreground))', fmt: (v) => String(Math.round(v)) },
  { key: 'alt', label: 'Höhe m', height: 90, color: 'hsl(var(--teal))', area: true, fmt: (v) => fmtNum(v) },
]

// Round a value range to readable ticks.
function ticks(lo: number, hi: number, n = 3) {
  const raw = (hi - lo) / n
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

export function StreamCharts({ points }: { points: StreamPoint[] }) {
  const [cursor, setCursor] = useState<number | null>(null)
  const maxKm = points.length ? points[points.length - 1].km : 0
  const x = (km: number) => L + ((W - L - R) * km) / (maxKm || 1)

  // Light smoothing of pace (5 points) so GPS jitter doesn't dominate.
  const data = useMemo(() => points.map((p, i) => {
    const w = points.slice(Math.max(0, i - 2), i + 3).map((q) => q.pace).filter((v): v is number => v != null && v < 900)
    return { ...p, pace: w.length ? w.reduce((a, b) => a + b, 0) / w.length : null }
  }), [points])

  const ranges = useMemo(() => SPECS.map((s) => {
    const vals = data.map((p) => p[s.key]).filter((v): v is number => v != null).sort((a, b) => a - b)
    if (!vals.length) return null
    // Pace: clip to the 2nd–98th percentile so stops don't flatten the curve.
    const lo = s.key === 'pace' ? vals[Math.floor(vals.length * 0.02)] : vals[0]
    const hi = s.key === 'pace' ? vals[Math.floor(vals.length * 0.98)] : vals[vals.length - 1]
    const pad = Math.max((hi - lo) * 0.1, s.key === 'alt' ? 2 : 3)
    return { lo: s.key === 'alt' ? Math.max(0, lo - pad) : lo - pad, hi: hi + pad }
  }), [data])

  const idx = cursor == null ? null : data.reduce((best, p, i) => (Math.abs(p.km - cursor) < Math.abs(data[best].km - cursor) ? i : best), 0)

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = e.currentTarget, pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    setCursor(Math.max(0, Math.min(maxKm, ((p.x - L) / (W - L - R)) * maxKm)))
  }

  if (!data.length) return <p className="text-sm text-muted-foreground">Für diesen Lauf gibt es keine Verlaufsdaten.</p>
  const cur = idx != null ? data[idx] : null

  return (
    <div className="flex flex-col gap-1">
      <div className="min-h-[18px] text-xs text-muted-foreground tabular-nums">
        {cur ? (
          <>km <b className="text-foreground">{fmtNum(cur.km, 1)}</b> · Pace <b className="text-foreground">{fmtPace(cur.pace)}</b> /km
            · HF <b className="text-foreground">{cur.hr ?? '–'}</b> · Höhe <b className="text-foreground">{cur.alt != null ? fmtNum(cur.alt) : '–'} m</b>
            {cur.cad ? <> · Kadenz <b className="text-foreground">{cur.cad}</b></> : null}</>
        ) : 'Cursor über die Diagramme bewegen'}
      </div>
      {SPECS.map((s, k) => {
        const rg = ranges[k]
        if (!rg) return null
        const T = 18, B = k === SPECS.length - 1 ? 22 : 6, H = s.height
        const y = (v: number) => {
          const t = (Math.min(Math.max(v, rg.lo), rg.hi) - rg.lo) / (rg.hi - rg.lo)
          return T + (H - T - B) * (s.invert ? t : 1 - t)
        }
        // Break the line where values are missing.
        const segs: string[][] = [[]]
        data.forEach((p) => { const v = p[s.key]; if (v == null) { if (segs[segs.length - 1].length) segs.push([]) } else segs[segs.length - 1].push(`${x(p.km)},${y(v)}`) })
        const cv = cur?.[s.key]
        return (
          <svg key={s.key} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none"
            onPointerMove={onMove} onPointerLeave={() => setCursor(null)} role="img" aria-label={`${s.label} über die Distanz`}>
            <text x={L} y={11} className="fill-foreground text-[11px] font-semibold">{s.label}</text>
            {ticks(rg.lo, rg.hi).map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" />
                <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{s.fmt(t)}</text>
              </g>
            ))}
            {s.area && segs.map((sg, i) => sg.length > 1 && (
              <polygon key={i} points={`${sg[0].split(',')[0]},${H - B} ${sg.join(' ')} ${sg[sg.length - 1].split(',')[0]},${H - B}`} fill="hsl(var(--teal-soft))" />
            ))}
            {segs.map((sg, i) => sg.length > 1 && <polyline key={i} points={sg.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />)}
            {k === SPECS.length - 1 && ticks(0, maxKm, 5).map((t) => (
              <text key={t} x={x(t)} y={H - 5} textAnchor="middle" className="fill-muted-foreground text-[10px]">{fmtNum(t)} km</text>
            ))}
            {cur && (
              <>
                <line x1={x(cur.km)} x2={x(cur.km)} y1={T} y2={H - B} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                {cv != null && <circle cx={x(cur.km)} cy={y(cv)} r={4} fill={s.color} stroke="hsl(var(--card))" strokeWidth={2} />}
              </>
            )}
            <rect x={L} y={0} width={W - L - R} height={H} fill="transparent" />
          </svg>
        )
      })}
    </div>
  )
}
