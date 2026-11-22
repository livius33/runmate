'use client'

import { useState } from 'react'
import type { Split } from '@/lib/analytics/run-metrics'
import { fmtNum, fmtPace } from './format'

const W = 640, H = 190, L = 44, R = 8, T = 12, B = 24

export function SplitsChart({ splits }: { splits: Split[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  if (!splits.length) return <p className="text-body-sm text-muted-foreground">Keine Kilometerzeiten für diesen Lauf.</p>

  const full = splits.filter((s) => s.distM >= 900)
  const paces = full.map((s) => s.paceS)
  const fastest = Math.min(...paces), slowest = Math.max(...paces)
  const avg = splits.reduce((t, s) => t + s.movingS, 0) / (splits.reduce((t, s) => t + s.distM, 0) / 1000)
  // Bars show speed (higher = faster); the axis is labelled in pace.
  const speed = (p: number) => 1000 / p
  const lo = speed(slowest + 20), hi = speed(Math.max(150, fastest - 15))
  const y = (p: number) => T + (H - T - B) * (1 - (speed(p) - lo) / (hi - lo))
  const bw = (W - L - R) / splits.length
  const tickPaces = [fastest, (fastest + slowest) / 2, slowest].map((p) => Math.round(p / 5) * 5)
  const h = hover != null ? splits[hover] : null

  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-[18px] text-caption text-muted-foreground tabular-nums">
        {h ? <>km <b className="text-foreground">{h.km}</b>{h.distM < 990 ? ` (${h.distM} m)` : ''} · <b className="text-foreground">{fmtPace(h.paceS)}</b> /km · HF <b className="text-foreground">{h.hr ?? '–'}</b>{h.cadence ? ` · Kadenz ${h.cadence}` : ''}{h.gainM ? ` · +${h.gainM} m` : ''}</>
          : <>Schnellster km <b className="text-foreground">{fmtPace(fastest)}</b> · langsamster <b className="text-foreground">{fmtPace(slowest)}</b> · Ø {fmtPace(avg)}</>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Pace je Kilometer" onPointerLeave={() => setHover(null)}>
        {tickPaces.map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(p) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtPace(p)}</text>
          </g>
        ))}
        {splits.map((s, i) => {
          const x0 = L + i * bw + 1.5, top = y(Math.min(s.paceS, slowest + 20)), base = H - B
          const fill = s.paceS === fastest ? 'hsl(var(--teal))' : s.paceS === slowest && s.distM >= 900 ? 'hsl(var(--muted-foreground) / 0.45)' : 'hsl(var(--brand))'
          const w = Math.max(2, bw - 3), r = Math.min(4, w / 2)
          return (
            <g key={s.km} onPointerEnter={() => setHover(i)}>
              <path d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + w - r} Q${x0 + w},${top} ${x0 + w},${top + r} V${base} Z`}
                fill={fill} opacity={hover == null || hover === i ? 1 : 0.55} />
              <rect x={x0 - 1.5} y={T} width={bw} height={H - T - B} fill="transparent" />
              {(splits.length <= 15 || s.km % 5 === 0 || s.km === 1) && (
                <text x={x0 + w / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{s.km}</text>
              )}
            </g>
          )
        })}
        <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke="hsl(var(--foreground))" strokeDasharray="4 3" />
      </svg>
      <button onClick={() => setTable(!table)} className="tap self-start text-caption text-muted-foreground underline underline-offset-2 hover:text-foreground">
        {table ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen'}
      </button>
      {table && (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm tabular-nums">
            <thead><tr className="border-b border-border text-left text-caption text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">km</th><th className="py-1.5 pr-3 font-medium">Pace</th><th className="py-1.5 pr-3 font-medium">Ø HF</th>
              <th className="py-1.5 pr-3 font-medium">Kadenz</th><th className="py-1.5 font-medium">Anstieg</th>
            </tr></thead>
            <tbody>
              {splits.map((s) => (
                <tr key={s.km} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-3">{s.km}{s.distM < 990 ? <span className="text-muted-foreground"> ({fmtNum(s.distM / 1000, 2)})</span> : ''}</td>
                  <td className="py-1.5 pr-3 font-medium">{fmtPace(s.paceS)}</td>
                  <td className="py-1.5 pr-3">{s.hr ?? '–'}</td>
                  <td className="py-1.5 pr-3">{s.cadence ?? '–'}</td>
                  <td className="py-1.5">{s.gainM ? `+${s.gainM} m` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
