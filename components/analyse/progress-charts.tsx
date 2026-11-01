'use client'

// Fortschritt im Block (07-27): four SVG charts in the style of charts.tsx. The numbers come from
// lib/analytics/progress.ts; here is only drawing and the hover readout.
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import type { BlockProgress, ProgressWeek, QualityPoint } from '@/lib/analytics/progress'
import { hrZones } from '@/lib/analytics/hr'
import { fmtNum, fmtPace } from '@/components/runs/format'
import { Readout, niceStep } from './charts'

const BRAND = 'hsl(var(--brand))', TEAL = 'hsl(var(--teal))', MUTED = 'hsl(var(--muted-foreground))', AMBER = '#b45309'
const fmtD = (d: string) => format(parseISO(d), 'd.M.')

function usePointerIndex(n: number, L: number, R: number, W: number) {
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget, pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const px = pt.matrixTransform(svg.getScreenCTM()!.inverse()).x
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))))
  }
  return { hover, onMove, clear: () => setHover(null) }
}

// Phase bands behind a weekly chart: alternating tint, label when the band is wide enough.
function PhaseBands({ phases, x, bw, T, H, B }: { phases: BlockProgress['phases']; x: (i: number) => number; bw: number; T: number; H: number; B: number }) {
  return (
    <g>
      {phases.map((p, k) => {
        const x0 = x(p.from) - bw / 2, x1 = x(p.to) + bw / 2
        return (
          <g key={`${p.label}-${p.from}`}>
            {k % 2 === 1 && <rect x={x0} y={T} width={x1 - x0} height={H - T - B} fill="hsl(var(--secondary))" opacity={0.7} />}
            {x1 - x0 > 46 && <text x={(x0 + x1) / 2} y={T + 10} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>}
          </g>
        )
      })}
    </g>
  )
}

function RaceMarker({ x, T, H, B, label, at = 'bottom' }: { x: number; T: number; H: number; B: number; label: string; at?: 'top' | 'bottom' }) {
  return (
    <g>
      <line x1={x} x2={x} y1={T} y2={H - B} stroke="hsl(var(--foreground))" strokeDasharray="4 3" opacity={0.5} />
      <text x={x + 4} y={at === 'top' ? T + 10 : H - B - 4} className="fill-foreground text-[10px] font-medium">{label}</text>
    </g>
  )
}

// ─── Blockfortschritt: cumulative planned vs. run km ─────────────────────────

export function CumulativeVolume({ p }: { p: BlockProgress }) {
  const { weeks, phases, raceWeek, race } = p
  const W = 680, H = 240, L = 40, R = 44, T = 12, B = 24
  const n = weeks.length
  const { hover, onMove, clear } = usePointerIndex(n, L, R, W)
  if (n < 1) return <p className="text-sm text-muted-foreground">Dieser Block hat noch keine Wochen.</p>
  const x = (i: number) => n === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (n - 1)
  const bw = n === 1 ? W - L - R : (W - L - R) / (n - 1)
  const top0 = Math.max(10, ...weeks.map((w) => w.cumPlanKm), ...weeks.map((w) => w.cumActualKm ?? 0))
  const step = niceStep(top0), top = Math.ceil(top0 / step) * step
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const started = weeks.filter((w) => w.cumActualKm != null)
  const lastI = started.length - 1
  const h = hover != null ? weeks[hover] : null
  const labelEvery = Math.ceil(n / 8)
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{h.label} ({fmtD(h.start)}, {h.phase}{h.easy ? ', Erholungswoche' : ''}): {h.actualKm != null
            ? <><b className="text-foreground">{fmtNum(h.actualKm, 1)}</b> von {fmtNum(h.planKm, 1)} km · kumuliert <b className="text-foreground">{fmtNum(h.cumActualKm!, 0)}</b> von {fmtNum(h.cumPlanKm, 0)} km ({h.cumActualKm! - h.cumPlanKm >= 0 ? '+' : '−'}{fmtNum(Math.abs(h.cumActualKm! - h.cumPlanKm), 0)})</>
            : <>{fmtNum(h.planKm, 1)} km geplant</>}</>
          : <><span className="text-brand">—</span> gelaufen · <span className="text-muted-foreground">—</span> Plan · kumuliert über den Block{started.length ? <> · Stand {started[lastI].label}</> : null}</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" role="img" aria-label="Kumulierte Kilometer: Plan und gelaufen" onPointerMove={onMove} onPointerLeave={clear}>
        <PhaseBands phases={phases} x={x} bw={bw} T={T} H={H} B={B} />
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v)}</text>
          </g>
        ))}
        {weeks.map((w, i) => i % labelEvery === 0 && (
          <text key={w.key} x={x(i)} y={H - 8} textAnchor="middle" className={`text-[10px] ${w.current ? 'fill-foreground font-semibold' : 'fill-muted-foreground'}`}>{w.label}</text>
        ))}
        {weeks.map((w, i) => w.easy && <circle key={w.key} cx={x(i)} cy={H - B + 3} r={2} fill={MUTED} />)}
        {raceWeek != null && <RaceMarker x={x(raceWeek)} T={T} H={H} B={B} label={race.name.split(' ')[0]} />}
        <polyline fill="none" stroke={MUTED} strokeWidth={2} strokeLinejoin="round" points={weeks.map((w, i) => `${x(i)},${y(w.cumPlanKm)}`).join(' ')} />
        <text x={W - R + 4} y={y(weeks[n - 1].cumPlanKm) + 4} className="fill-muted-foreground text-[10px]">Plan</text>
        {started.length > 0 && (
          <>
            <polyline fill="none" stroke={BRAND} strokeWidth={2.5} strokeLinejoin="round" points={started.map((w, i) => `${x(i)},${y(w.cumActualKm!)}`).join(' ')} />
            <circle cx={x(lastI)} cy={y(started[lastI].cumActualKm!)} r={4} fill={BRAND} stroke="hsl(var(--card))" strokeWidth={2} />
            <text x={x(lastI) + 7} y={y(started[lastI].cumActualKm!) + (started[lastI].cumActualKm! < started[lastI].cumPlanKm ? 14 : -6)} className="fill-foreground text-[10px] font-semibold">{fmtNum(started[lastI].cumActualKm!)} km</text>
          </>
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={MUTED} strokeDasharray="3 3" />}
      </svg>
    </div>
  )
}

// ─── Longrun-Aufbau: longest planned session vs. longest run per week ────────

export function LongRunChart({ p }: { p: BlockProgress }) {
  const { weeks, raceWeek, race } = p
  const [hover, setHover] = useState<number | null>(null)
  const W = 460, H = 220, L = 34, R = 8, T = 12, B = 24
  const n = weeks.length
  if (n < 1) return <p className="text-sm text-muted-foreground">Dieser Block hat noch keine Wochen.</p>
  const bw = (W - L - R) / n
  const top0 = Math.max(10, ...weeks.map((w) => Math.max(w.longPlanKm ?? 0, w.longActualKm ?? 0)))
  const step = niceStep(top0), top = Math.ceil(top0 / step) * step
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const labelEvery = Math.ceil(n / 6)
  const h = hover != null ? weeks[hover] : null
  const bar = (x0: number, w: number, v: number) => { const ht = y(0) - y(v), r = Math.min(4, w / 2, ht); return `M${x0},${y(0)} V${y(v) + r} Q${x0},${y(v)} ${x0 + r},${y(v)} H${x0 + w - r} Q${x0 + w},${y(v)} ${x0 + w},${y(v) + r} V${y(0)} Z` }
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{h.label}: {h.longPlanKm != null ? <>{fmtNum(h.longPlanKm, 1)} km geplant{h.longPlanDate ? ` (${fmtD(h.longPlanDate)})` : ''}</> : 'kein Longrun geplant'} · längster Lauf {h.longActualKm != null ? <b className="text-foreground">{fmtNum(h.longActualKm, 1)} km</b> : h.started ? 'noch keiner' : '–'}</>
          : <><span className="text-muted-foreground">▢</span> längste geplante Einheit · <span className="text-brand">■</span> längster Lauf der Woche</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Longrun je Woche: geplant und gelaufen" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v)}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x0 = L + i * bw + 2, wid = Math.max(2, bw - 4)
          const op = hover == null || hover === i ? 1 : 0.6
          return (
            <g key={w.key} onPointerEnter={() => setHover(i)}>
              {w.longPlanKm != null && w.longPlanKm > 0 && <path d={bar(x0, wid, w.longPlanKm)} fill="transparent" stroke={MUTED} strokeWidth={1.5} opacity={op} />}
              {w.longActualKm != null && w.longActualKm > 0 && <path d={bar(x0 + 2, Math.max(1, wid - 4), w.longActualKm)} fill={BRAND} opacity={op * (w.current ? 0.75 : 1)} />}
              <rect x={x0 - 2} y={T} width={bw} height={H - T - B} fill="transparent" />
              {i % labelEvery === 0 && <text x={x0 + wid / 2} y={H - 8} textAnchor="middle" className={`text-[10px] ${w.current ? 'fill-foreground font-semibold' : 'fill-muted-foreground'}`}>{w.label}</text>}
            </g>
          )
        })}
        {raceWeek != null && <RaceMarker x={L + raceWeek * bw + bw / 2} T={T} H={H} B={B} label={race.name.split(' ')[0]} at="top" />}
      </svg>
    </div>
  )
}

// ─── Tempo in Zone 2: weekly median pace of clean Zone-2 km ──────────────────

export function Zone2Pace({ p }: { p: BlockProgress }) {
  const { weeks } = p
  const [hover, setHover] = useState<number | null>(null)
  const W = 460, H = 220, L = 40, R = 26, T = 12, B = 24
  const z2 = hrZones()[1]
  const pts = weeks.map((w, i) => ({ w, i })).filter(({ w }) => w.z2PaceS != null)
  if (pts.length < 2) return <p className="text-sm text-muted-foreground">Noch zu wenige Wochen mit mindestens 4 sauberen Kilometern in Zone 2 ({z2.min}–{z2.max}).</p>
  const n = weeks.length
  const x = (i: number) => n === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (n - 1)
  const vals = pts.map(({ w }) => w.z2PaceS!)
  const gridStep = [5, 10, 15, 20, 30, 60].find((s) => (Math.max(...vals) - Math.min(...vals) + 10) / s <= 5) ?? 60
  const lo = Math.floor((Math.min(...vals) - 5) / gridStep) * gridStep, hi = Math.ceil((Math.max(...vals) + 5) / gridStep) * gridStep
  // Faster is better, so faster paces sit higher.
  const y = (s: number) => T + (H - T - B) * ((s - lo) / (hi - lo))
  const segs: string[][] = [[]]
  weeks.forEach((w, i) => { if (w.z2PaceS == null) { if (segs[segs.length - 1].length) segs.push([]) } else segs[segs.length - 1].push(`${x(i)},${y(w.z2PaceS)}`) })
  const last = pts[pts.length - 1]
  const h = hover != null ? weeks[hover] : null
  const labelEvery = Math.ceil(n / 6)
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{h.label}: {h.z2PaceS != null ? <><b className="text-foreground">{fmtPace(h.z2PaceS)}/km</b> aus {h.z2Km} km in Zone 2</> : <>{h.z2Km} km in Zone 2 – zu wenige für einen Wert</>}</>
          : <>Median-Tempo aller flachen km mit Puls {z2.min}–{z2.max} · höher = schneller{p.z2.deltaS != null && <> · {p.z2.deltaS > 0 ? '+' : p.z2.deltaS < 0 ? '−' : '±'}{Math.abs(p.z2.deltaS)} s/km seit Blockstart</>}</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tempo in Zone 2 pro Woche" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round((hi - lo) / gridStep) + 1 }, (_, i) => lo + i * gridStep).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtPace(v)}</text>
          </g>
        ))}
        {weeks.map((w, i) => i % labelEvery === 0 && (
          <text key={w.key} x={x(i)} y={H - 8} textAnchor="middle" className={`text-[10px] ${w.current ? 'fill-foreground font-semibold' : 'fill-muted-foreground'}`}>{w.label}</text>
        ))}
        {segs.map((s, i) => s.length > 1 && <polyline key={i} points={s.join(' ')} fill="none" stroke={TEAL} strokeWidth={2} strokeLinejoin="round" />)}
        {pts.map(({ w, i }) => (
          <g key={w.key} onPointerEnter={() => setHover(i)}>
            <circle cx={x(i)} cy={y(w.z2PaceS!)} r={i === last.i ? 5 : 3.5} fill={i === last.i ? TEAL : 'hsl(var(--card))'} stroke={TEAL} strokeWidth={2} />
            <circle cx={x(i)} cy={y(w.z2PaceS!)} r={12} fill="transparent" />
          </g>
        ))}
        <text x={x(last.i) + (last.i === n - 1 ? -8 : 8)} y={y(last.w.z2PaceS!) - 8} textAnchor={last.i === n - 1 ? 'end' : 'start'} className="fill-foreground text-[10px] font-semibold">{fmtPace(last.w.z2PaceS!)}</text>
      </svg>
    </div>
  )
}

// ─── Renntempo-Blöcke: Δ to the target pace per paced session ────────────────

const VERDICT_COLOR: Record<QualityPoint['verdict'], string> = { 'im Ziel': TEAL, 'zu langsam': BRAND, 'zu schnell': AMBER, 'kein Lauf': MUTED }

export function QualityDots({ p }: { p: BlockProgress }) {
  const { weeks, race, quality } = p
  const [hover, setHover] = useState<number | null>(null)
  const W = 680, H = 240, L = 40, R = 12, T = 12, B = 24
  const pts = quality.points
  if (!weeks.length) return <p className="text-sm text-muted-foreground">Dieser Block hat noch keine Wochen.</p>
  if (!pts.length) return <p className="text-sm text-muted-foreground">Noch keine Tempo-Einheit im Block.</p>
  const d0 = parseISO(weeks[0].start).getTime(), d1 = parseISO(weeks[weeks.length - 1].end).getTime()
  const x = (d: string) => L + ((W - L - R) * (parseISO(d).getTime() - d0)) / Math.max(1, d1 - d0)
  const attempted = pts.filter((q) => q.attempted && q.deltaS != null).map((q) => Math.abs(q.deltaS!))
  const lim = Math.max(15, Math.ceil((Math.max(0, ...attempted) + 3) / 5) * 5)
  const y = (s: number) => T + (H - T - B) * (1 - (Math.max(-lim, Math.min(lim, s)) + lim) / (2 * lim))
  const gridStep = lim <= 20 ? 5 : lim <= 40 ? 10 : 20
  const h = hover != null ? pts[hover] : null
  const labelEvery = Math.ceil(weeks.length / 8)
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{fmtD(h.ranOn ?? h.date)} {h.title}: {h.actualS != null
            ? <><b className="text-foreground">{fmtPace(h.actualS)}/km</b> statt {fmtPace(h.targetS)} ({h.deltaS! > 0 ? '+' : ''}{h.deltaS} s){h.hr != null && <> · HF {h.hr}</>} · {h.attempted ? h.verdict : 'nicht versucht'}{h.km ? ` · ${fmtNum(h.km, 1)} km` : ''}</>
            : 'kein Lauf'}</>
          : <><span className="text-teal">●</span> im Ziel · <span className="text-brand">●</span> zu langsam · <span style={{ color: AMBER }}>●</span> zu schnell · ○ nicht versucht · ■ schneller als Renntempo · Band = ±5 s/km</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Abweichung vom Zieltempo je Tempo-Einheit" onPointerLeave={() => setHover(null)}>
        <rect x={L} width={W - L - R} y={y(5)} height={y(-5) - y(5)} fill={TEAL} opacity={0.08} />
        {Array.from({ length: Math.round((2 * lim) / gridStep) + 1 }, (_, i) => -lim + i * gridStep).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? MUTED : 'hsl(var(--border))'} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{v > 0 ? '+' : ''}{v}{v === lim ? ' s' : ''}</text>
          </g>
        ))}
        {weeks.map((w, i) => i % labelEvery === 0 && (
          <text key={w.key} x={x(w.start) + 4} y={H - 8} className={`text-[10px] ${w.current ? 'fill-foreground font-semibold' : 'fill-muted-foreground'}`}>{w.label}</text>
        ))}
        <text x={L + 4} y={y(lim) + 10} className="fill-muted-foreground text-[10px]">langsamer</text>
        <text x={L + 4} y={y(-lim) - 4} className="fill-muted-foreground text-[10px]">schneller</text>
        <RaceMarker x={x(race.date)} T={T} H={H} B={B} label={race.name.split(' ')[0]} />
        {pts.map((q, i) => {
          const cx = x(q.ranOn ?? q.date)
          const big = hover === i
          const op = hover == null || big ? 0.9 : 0.4
          if (q.deltaS == null) return (
            <g key={q.date} onPointerEnter={() => setHover(i)}>
              <text x={cx} y={y(lim) + 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">×</text>
              <circle cx={cx} cy={y(lim)} r={12} fill="transparent" />
            </g>
          )
          const cy = y(q.deltaS), c = VERDICT_COLOR[q.verdict]
          const fill = q.attempted ? c : 'hsl(var(--card))', stroke = q.attempted ? 'hsl(var(--card))' : c
          const r = big ? 6.5 : 5
          return (
            <g key={q.date} onPointerEnter={() => setHover(i)} opacity={op}>
              {q.racePace
                ? <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={q.attempted ? 1.5 : 2} />
                : <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={1.5} fill={fill} stroke={stroke} strokeWidth={q.attempted ? 1.5 : 2} />}
              <circle cx={cx} cy={cy} r={13} fill="transparent" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export type { ProgressWeek }
