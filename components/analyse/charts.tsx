'use client'

import { useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { de } from 'date-fns/locale'
import { hrZones } from '@/lib/analytics/hr'
import { RUN_TYPES } from '@/lib/analytics/run-metrics'
import type { AnalyticsRun } from '@/app/api/running/analytics/route'
import { fmtClock, fmtNum, fmtPace, percentile } from '@/components/runs/format'
import { RunTypeTag } from '@/components/runs/tags'
import { activeBlock } from '@/lib/plan/blocks'
import { todayLocal } from '@/lib/dates'
import { ZONE_COLORS } from '@/components/runs/ZonesBar'

export const Readout = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-[18px] text-caption text-muted-foreground tabular-nums">{children}</div>
)

export function niceStep(max: number, n = 4) {
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
}

// ─── Volume: weekly (or monthly) bars + rolling average ──────────────────────

export interface Bucket { key: string; label: string; km: number; runs: number; partial?: boolean }

export function VolumeChart({ buckets, unit }: { buckets: Bucket[]; unit: 'Woche' | 'Monat' }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 680, H = 230, L = 38, R = 8, T = 10, B = 24
  const max = Math.max(10, ...buckets.map((b) => b.km))
  const step = niceStep(max), top = Math.ceil(max / step) * step
  const bw = (W - L - R) / buckets.length
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const avg = buckets.map((_, i) => { const s = buckets.slice(Math.max(0, i - 3), i + 1); return s.reduce((a, b) => a + b.km, 0) / s.length })
  const labelEvery = Math.ceil(buckets.length / 8)
  const h = hover != null ? buckets[hover] : null
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{h.label}: <b className="text-foreground">{fmtNum(h.km, 1)} km</b> in {h.runs} Läufen{h.partial ? ' (läuft noch)' : ''} · Schnitt der letzten 4: {fmtNum(avg[hover!], 0)} km</>
          : <>Balken = km pro {unit} · Linie = Schnitt der letzten 4 {unit === 'Woche' ? 'Wochen' : 'Monate'}</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Kilometer pro ${unit}`} onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v)}</text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x0 = L + i * bw + 1, w = Math.max(1.5, bw - 2), ht = y(0) - y(b.km), r = Math.min(4, w / 2, ht)
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)}>
              {b.km > 0 && (
                <path d={`M${x0},${y(0)} V${y(b.km) + r} Q${x0},${y(b.km)} ${x0 + r},${y(b.km)} H${x0 + w - r} Q${x0 + w},${y(b.km)} ${x0 + w},${y(b.km) + r} V${y(0)} Z`}
                  fill="hsl(var(--brand))" opacity={b.partial ? 0.45 : hover == null || hover === i ? 1 : 0.6} />
              )}
              <rect x={x0 - 1} y={T} width={bw} height={H - T - B} fill="transparent" />
              {i % labelEvery === 0 && <text x={x0 + w / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{b.label.split(' ').slice(-1)[0]}</text>}
            </g>
          )
        })}
        <polyline fill="none" stroke="hsl(var(--foreground))" strokeWidth={2} strokeLinejoin="round"
          points={avg.map((v, i) => `${L + i * bw + bw / 2},${y(v)}`).join(' ')} />
      </svg>
    </div>
  )
}

// ─── Year comparison: cumulative km by date ──────────────────────────────────

const YEAR_COLORS = ['#3a74d4', 'hsl(var(--teal))', 'hsl(var(--brand))']   // oldest → current

export function YearComparison({ runs, today }: { runs: AnalyticsRun[]; today: string }) {
  const [hover, setHover] = useState<{ year: number; month: number; km: number } | null>(null)
  const current = Number(today.slice(0, 4))
  const years = [current - 2, current - 1, current]
  const W = 460, H = 230, L = 42, R = 42, T = 10, B = 24
  const series = years.map((yr) => {
    let total = 0
    return Array.from({ length: 12 }, (_, m) => {
      const key = `${yr}-${String(m + 1).padStart(2, '0')}`
      if (yr === current && key > today.slice(0, 7)) return null
      total += runs.filter((r) => r.date.startsWith(key)).reduce((a, r) => a + r.km, 0)
      return total
    })
  })
  const max = Math.max(100, ...series.flat().filter((v): v is number => v != null))
  const step = niceStep(max), top = Math.ceil(max / step) * step
  const x = (m: number) => L + ((W - L - R) * m) / 11, y = (v: number) => T + (H - T - B) * (1 - v / top)
  const lastCur = series[2].filter((v) => v != null).length - 1
  const prevSame = series[1][lastCur]
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {hover ? <>{hover.year}, Ende {format(new Date(hover.year, hover.month, 1), 'MMMM', { locale: de })}: <b className="text-foreground">{fmtNum(hover.km)} km</b></>
          : series[2][lastCur] != null && !series[1][11]
            // No run in the year before (a new account): nothing to compare with.
            ? <>{current} bis jetzt <b className="text-foreground">{fmtNum(series[2][lastCur]!)} km</b></>
          : prevSame != null && series[2][lastCur] != null
            ? <>{current} bis jetzt <b className="text-foreground">{fmtNum(series[2][lastCur]!)} km</b>, {series[2][lastCur]! >= prevSame ? `${fmtNum(series[2][lastCur]! - prevSame)} km mehr` : `${fmtNum(prevSame - series[2][lastCur]!)} km weniger`} als {current - 1} zur selben Zeit</>
            : 'Kumulierte Kilometer je Jahr'}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Kumulierte Kilometer der letzten drei Jahre" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v)}</text>
          </g>
        ))}
        {'JFMAMJJASOND'.split('').map((c, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{c}</text>)}
        {series.map((s, k) => {
          const pts = s.map((v, m) => (v == null ? null : [x(m), y(v)] as const)).filter(Boolean) as (readonly [number, number])[]
          const last = pts[pts.length - 1]
          if (!last) return null
          return (
            <g key={years[k]}>
              <polyline fill="none" stroke={YEAR_COLORS[k]} strokeWidth={k === 2 ? 2.5 : 2} points={pts.map((p) => p.join(',')).join(' ')} />
              {s.map((v, m) => v != null && (
                <circle key={m} cx={x(m)} cy={y(v)} r={9} fill="transparent" onPointerEnter={() => setHover({ year: years[k], month: m, km: v })} />
              ))}
              <circle cx={last[0]} cy={last[1]} r={4} fill={YEAR_COLORS[k]} stroke="hsl(var(--card))" strokeWidth={2} />
              <text x={last[0] + 7} y={last[1] + 4} className="fill-foreground text-[11px] font-semibold">{years[k]}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ─── Aerobic efficiency: monthly mean on easy runs ───────────────────────────

export function EfficiencyTrend({ months }: { months: { key: string; eff: number | null; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 680, H = 210, L = 44, R = 12, T = 12, B = 24
  const vals = months.map((m) => m.eff).filter((v): v is number => v != null)
  if (vals.length < 2) return <p className="text-body-sm text-muted-foreground">Zu wenige lockere Läufe mit Pulsdaten in diesem Zeitraum.</p>
  const lo = Math.floor((Math.min(...vals) - 0.02) * 20) / 20, hi = Math.ceil((Math.max(...vals) + 0.02) * 20) / 20
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(1, months.length - 1)
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo))
  const segs: string[][] = [[]]
  months.forEach((m, i) => { if (m.eff == null) { if (segs[segs.length - 1].length) segs.push([]) } else segs[segs.length - 1].push(`${x(i)},${y(m.eff)}`) })
  const bestI = months.reduce((b, m, i) => (m.eff != null && (months[b].eff == null || m.eff > months[b].eff!) ? i : b), months.findIndex((m) => m.eff != null))
  const lastI = months.map((m) => m.eff != null).lastIndexOf(true)
  const h = hover != null ? months[hover] : null
  const labelEvery = Math.ceil(months.length / 8)
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{format(parseISO(h.key + '-01'), 'MMMM yyyy', { locale: de })}: {h.eff != null ? <><b className="text-foreground">{fmtNum(h.eff, 3)} m/Schlag</b> · {h.n} lockere Läufe</> : 'keine lockeren Läufe mit Puls'}</>
          : <>Zuletzt <b className="text-foreground">{fmtNum(months[lastI].eff!, 2)}</b> · bester Monat {format(parseISO(months[bestI].key + '-01'), 'MMM yyyy', { locale: de })} mit {fmtNum(months[bestI].eff!, 2)} · höher = mehr Tempo pro Herzschlag</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Aerobe Effizienz pro Monat" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round((hi - lo) / 0.05) + 1 }, (_, i) => lo + i * 0.05).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v, 2)}</text>
          </g>
        ))}
        {months.map((m, i) => i % labelEvery === 0 && (
          <text key={m.key} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{format(parseISO(m.key + '-01'), 'MMM yy', { locale: de })}</text>
        ))}
        {segs.map((s, i) => s.length > 1 && <polyline key={i} points={s.join(' ')} fill="none" stroke="hsl(var(--teal))" strokeWidth={2} />)}
        {months.map((m, i) => m.eff != null && (
          <g key={m.key} onPointerEnter={() => setHover(i)}>
            <circle cx={x(i)} cy={y(m.eff)} r={i === lastI ? 5 : 3.5} fill={i === lastI ? 'hsl(var(--teal))' : 'hsl(var(--card))'} stroke="hsl(var(--teal))" strokeWidth={2} />
            <circle cx={x(i)} cy={y(m.eff)} r={11} fill="transparent" />
          </g>
        ))}
      </svg>
      <p className="text-caption text-muted-foreground">Lücken sind Monate ohne lockere Läufe mit Pulsdaten.</p>
    </div>
  )
}

// ─── Consistency calendar: last 17 weeks ─────────────────────────────────────

const HEAT = ['hsl(var(--secondary))', 'hsl(358 90% 88%)', 'hsl(358 80% 72%)', 'hsl(358 75% 59%)', 'hsl(358 70% 38%)']
const HEAT_LABELS = ['kein Lauf', 'unter 8 km', '8–14 km', '14–20 km', '20 km +']

export function ConsistencyCalendar({ runs, today }: { runs: AnalyticsRun[]; today: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const weeks = 17, cell = 20, gap = 3, L = 22, T = 16
  const start = addDays(startOfWeek(parseISO(today), { weekStartsOn: 1 }), -(weeks - 1) * 7)
  const byDay = new Map<string, number>()
  for (const r of runs) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.km)
  const lvl = (km?: number) => (!km ? 0 : km < 8 ? 1 : km < 14 ? 2 : km < 20 ? 3 : 4)
  const days = Array.from({ length: weeks * 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd')).filter((d) => d <= today)
  const active = days.filter((d) => byDay.has(d)).length
  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {hover ? <>{format(parseISO(hover), 'EEE d. MMM', { locale: de })}: <b className="text-foreground">{byDay.has(hover) ? `${fmtNum(byDay.get(hover)!, 1)} km` : 'kein Lauf'}</b></>
          : <><b className="text-foreground">{active}</b> Lauftage in {weeks} Wochen · Ø {fmtNum(active / weeks, 1)} pro Woche</>}
      </Readout>
      <svg viewBox={`0 0 ${L + weeks * (cell + gap)} ${T + 7 * (cell + gap)}`} className="w-full h-auto max-w-[460px]" role="img" aria-label="Laufkalender" onPointerLeave={() => setHover(null)}>
        {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => i % 2 === 0 && <text key={i} x={L - 6} y={T + i * (cell + gap) + 14} textAnchor="end" className="fill-muted-foreground text-[10px]">{d}</text>)}
        {days.map((d, i) => {
          const w = Math.floor(i / 7), dow = i % 7
          const date = parseISO(d)
          return (
            <g key={d}>
              {dow === 0 && date.getDate() <= 7 && <text x={L + w * (cell + gap)} y={T - 5} className="fill-muted-foreground text-[10px]">{format(date, 'MMM', { locale: de })}</text>}
              <rect x={L + w * (cell + gap)} y={T + dow * (cell + gap)} width={cell} height={cell} rx={4} fill={HEAT[lvl(byDay.get(d))]}
                stroke={d === today ? 'hsl(var(--foreground))' : 'none'} onPointerEnter={() => setHover(d)} />
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground">
        {HEAT_LABELS.map((l, i) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: HEAT[i] }} />{l}</span>)}
      </div>
    </div>
  )
}

// ─── Intensity: time in zones + km by run type ───────────────────────────────

export function Intensity({ runs }: { runs: AnalyticsRun[] }) {
  const zones = hrZones().map((_, i) => runs.reduce((a, r) => a + (r.zonesS?.[i] ?? 0), 0))
  const total = zones.reduce((a, b) => a + b, 0)
  const easyPct = total ? Math.round(((zones[0] + zones[1]) / total) * 100) : null
  const byType = RUN_TYPES.map((t) => ({ t, km: runs.filter((r) => r.type === t).reduce((a, r) => a + r.km, 0), n: runs.filter((r) => r.type === t).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.km - a.km)
  const maxKm = Math.max(1, ...byType.map((x) => x.km))
  return (
    <div className="flex flex-col gap-4">
      {total > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-control" role="img" aria-label="Zeit in Pulszonen">
            {zones.map((s, i) => s > 0 && <div key={i} style={{ flex: s, background: ZONE_COLORS[i] }} title={`${hrZones()[i].name}: ${Math.round((s / total) * 100)} %`} />)}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground tabular-nums">
            {hrZones().map((z, i) => (
              <span key={z.name} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ZONE_COLORS[i] }} />{z.name} {Math.round((zones[i] / total) * 100)} % <span className="opacity-70">({fmtClock(zones[i])})</span>
              </span>
            ))}
          </div>
          <p className="text-body-sm">
            <b>{easyPct} %</b> der Zeit locker (Z1+Z2).{' '}
            <span className="text-muted-foreground">{easyPct! >= 75 ? 'Das passt zur 80/20-Regel.' : 'Für 80/20 wären es rund 80 %: die lockeren Läufe sind oft zu schnell.'}</span>
          </p>
        </div>
      ) : <p className="text-body-sm text-muted-foreground">Keine Pulsdaten in diesem Zeitraum.</p>}
      <ul className="grid gap-1.5 text-body-sm tabular-nums">
        {byType.map((x) => (
          <li key={x.t} className="grid grid-cols-[104px_1fr_auto] items-center gap-3">
            <RunTypeTag type={x.t} className="justify-self-start" />
            <span className="h-2 rounded-control bg-secondary"><span className="block h-2 rounded-control bg-foreground/70" style={{ width: `${(x.km / maxKm) * 100}%` }} /></span>
            <span className="text-right">{fmtNum(x.km)} km <span className="text-muted-foreground">· {x.n}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Fitness & form: CTL / ATL on one scale, TSB as its own small chart ──────

export interface FitnessPoint { date: string; ctl: number; atl: number; tsb: number; load: number }

function formLabel(tsb: number) {
  if (tsb > 15) return 'sehr erholt'
  if (tsb > 5) return 'frisch'
  if (tsb > -10) return 'im Training'
  if (tsb > -25) return 'müde'
  return 'sehr müde'
}

export function FitnessForm({ points, target }: { points: FitnessPoint[]; target?: { label: string; ctl: number } }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <p className="text-body-sm text-muted-foreground">Noch zu wenige Daten.</p>
  const W = 1100, L = 38, R = 72, H1 = 220, H2 = 100, T = 10, B = 4   // full-width panel
  const x = (i: number) => L + ((W - L - R) * i) / (points.length - 1)
  const max = Math.max(target?.ctl ?? 0, ...points.map((p) => Math.max(p.ctl, p.atl))) * 1.08
  const step = niceStep(max), top = Math.ceil(max / step) * step
  const y1 = (v: number) => T + (H1 - T - B) * (1 - v / top)
  const tMax = Math.max(10, ...points.map((p) => Math.abs(p.tsb)))
  const y2 = (v: number) => 8 + (H2 - 30) * (1 - (v + tMax) / (2 * tMax))
  const line = (k: 'ctl' | 'atl') => points.map((p, i) => `${x(i)},${y1(p[k])}`).join(' ')
  const last = points[points.length - 1]
  const cur = hover != null ? points[hover] : last
  const bw = Math.max(1, (W - L - R) / points.length - 1)
  const labelEvery = Math.ceil(points.length / 7)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget, pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const px = pt.matrixTransform(svg.getScreenCTM()!.inverse()).x
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / (W - L - R)) * (points.length - 1)))))
  }

  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {format(parseISO(cur.date), 'EEE d. MMM yyyy', { locale: de })}: Fitness <b className="text-foreground">{fmtNum(cur.ctl)}</b>
        {' '}· Ermüdung <b className="text-foreground">{fmtNum(cur.atl)}</b> · Form <b className="text-foreground">{cur.tsb > 0 ? '+' : cur.tsb < 0 ? '−' : ''}{fmtNum(Math.abs(cur.tsb))}</b> ({formLabel(cur.tsb)})
        {target && hover == null && <> · bis zum Ziel noch {fmtNum(Math.max(0, target.ctl - last.ctl))} Fitness-Punkte</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H1}`} className="w-full h-auto touch-none" role="img" aria-label="Fitness und Ermüdung" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y1(v)} y2={y1(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y1(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v)}</text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={L} x2={W - R} y1={y1(target.ctl)} y2={y1(target.ctl)} stroke="hsl(var(--brand))" strokeDasharray="5 4" />
            <text x={W - R + 4} y={y1(target.ctl) + 4} className="fill-brand-text text-[10px] font-medium">{target.label}</text>
          </g>
        )}
        <polyline points={line('atl')} fill="none" stroke="hsl(var(--muted-foreground) / 0.6)" strokeWidth={1.5} />
        <polyline points={line('ctl')} fill="none" stroke="#3a74d4" strokeWidth={2.5} />
        <text x={W - R + 4} y={y1(last.ctl) + 4} className="fill-foreground text-[10px] font-semibold">Fitness</text>
        <text x={W - R + 4} y={y1(last.atl) + (Math.abs(y1(last.atl) - y1(last.ctl)) < 12 ? 16 : 4)} className="fill-muted-foreground text-[10px]">Ermüdung</text>
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H1 - B} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />}
      </svg>
      <svg viewBox={`0 0 ${W} ${H2}`} className="w-full h-auto touch-none" role="img" aria-label="Form" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <text x={L} y={8} className="fill-muted-foreground text-[10px]">Form (Fitness − Ermüdung)</text>
        <line x1={L} x2={W - R} y1={y2(0)} y2={y2(0)} stroke="hsl(var(--border))" />
        {points.map((p, i) => (
          <rect key={p.date} x={x(i) - bw / 2} width={bw} y={Math.min(y2(0), y2(p.tsb))} height={Math.abs(y2(p.tsb) - y2(0))}
            fill={p.tsb >= 0 ? 'hsl(var(--teal))' : 'hsl(var(--brand))'} opacity={hover == null || hover === i ? 0.85 : 0.45} />
        ))}
        <text x={W - R + 4} y={y2(tMax * 0.6)} className="fill-teal-text text-[10px]">frisch</text>
        <text x={W - R + 4} y={y2(-tMax * 0.6)} className="fill-brand-text text-[10px]">müde</text>
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.date} x={x(i)} y={H2 - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">{format(parseISO(p.date), 'd. MMM', { locale: de })}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={8} y2={H2 - 22} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />}
      </svg>
      <p className="text-caption text-muted-foreground">
        Fitness = Trainingsbelastung der letzten ~6 Wochen, Ermüdung = der letzten ~7 Tage (aus Dauer und Puls).
        Vor einem Rennen soll die Form ins Positive drehen.
      </p>
    </div>
  )
}

// ─── Pace × heart rate: one dot per run ──────────────────────────────────────

const EASY_TYPES = ['Locker', 'Regeneration']
const fmtP = (s: number) => fmtPace(Math.round(s))

export function PaceHrScatter({ runs }: { runs: AnalyticsRun[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const pts = runs.filter((r) => r.hr != null && r.km >= 3 && r.movingS > 0)
    .map((r) => ({ r, pace: r.movingS / r.km, hr: r.hr! }))
  if (!pts.length) return <p className="text-body-sm text-muted-foreground">Keine Läufe mit Pulsdaten in diesem Zeitraum.</p>

  const W = 680, H = 260, L = 38, R = 10, T = 10, B = 26
  const z2 = hrZones()[1]
  // Axis ranges ignore GPS outliers; always include race pace and the Z2 band.
  const goalPaceS = activeBlock(todayLocal()).race.goalPaceS
  const pLo = Math.min(goalPaceS - 10, percentile(pts.map((p) => p.pace), 0.02))
  const pHi = Math.max(goalPaceS + 30, percentile(pts.map((p) => p.pace), 0.98))
  const x0 = Math.floor(pLo / 15) * 15, x1 = Math.ceil(pHi / 15) * 15
  const hLo = Math.min(z2.min, ...pts.map((p) => p.hr)), hHi = Math.max(z2.max, ...pts.map((p) => p.hr))
  const y0 = Math.floor((hLo - 5) / 10) * 10, y1 = Math.ceil((hHi + 5) / 10) * 10
  const x = (s: number) => L + (W - L - R) * ((Math.min(x1, Math.max(x0, s)) - x0) / (x1 - x0))
  const y = (h: number) => T + (H - T - B) * (1 - (h - y0) / (y1 - y0))
  const xStep = x1 - x0 > 180 ? 60 : 30
  const color = (r: AnalyticsRun) => r.type === 'Laufband' ? 'hsl(var(--muted-foreground))' : EASY_TYPES.includes(r.type) ? 'hsl(var(--teal))' : 'hsl(var(--brand))'
  const h = hover != null ? pts[hover] : null

  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? <>{format(parseISO(h.r.date), 'd.M.yy')} · {h.r.type} · {fmtNum(h.r.km, 1)} km · <b className="text-foreground">{fmtP(h.pace)}/km</b> bei <b className="text-foreground">{h.hr} bpm</b></>
          : <><span className="text-teal">●</span> locker · <span className="text-brand">●</span> Tempo, Longrun, Rennen · Band = Z2 ({z2.min}–{z2.max})</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tempo und Puls pro Lauf" onPointerLeave={() => setHover(null)}>
        <rect x={L} width={W - L - R} y={y(z2.max)} height={y(z2.min) - y(z2.max)} fill="hsl(var(--teal))" opacity={0.08} />
        {Array.from({ length: Math.floor((y1 - y0) / 10) + 1 }, (_, i) => y0 + i * 10).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{v}</text>
          </g>
        ))}
        {Array.from({ length: Math.floor((x1 - x0) / xStep) + 1 }, (_, i) => x0 + i * xStep).map((v) => (
          <text key={v} x={x(v)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{fmtP(v)}</text>
        ))}
        <line x1={x(goalPaceS)} x2={x(goalPaceS)} y1={T} y2={H - B} stroke="hsl(var(--foreground))" strokeDasharray="4 3" opacity={0.6} />
        <text x={x(goalPaceS) + 4} y={T + 10} className="fill-foreground text-[10px]">{fmtP(goalPaceS)}</text>
        {pts.map((p, i) => (
          <circle key={p.r.id} cx={x(p.pace)} cy={y(p.hr)} r={hover === i ? 6 : 4} fill={color(p.r)}
            opacity={hover == null || hover === i ? 0.85 : 0.35} stroke="hsl(var(--card))" strokeWidth={1}
            onPointerEnter={() => setHover(i)} />
        ))}
      </svg>
    </div>
  )
}

// ─── 80/20 per week: share of easy (Z1+Z2) vs. hard (Z3–Z5) time ─────────────

export interface EasyHardWeek { key: string; label: string; easyS: number; hardS: number }

export function WeeklyEasyHard({ weeks }: { weeks: EasyHardWeek[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!weeks.some((w) => w.easyS + w.hardS > 0)) return <p className="text-body-sm text-muted-foreground">Keine Pulsdaten in diesem Zeitraum.</p>
  const W = 680, H = 220, L = 38, R = 8, T = 10, B = 24
  const bw = (W - L - R) / weeks.length
  const y = (pct: number) => T + (H - T - B) * (1 - pct / 100)
  const labelEvery = Math.ceil(weeks.length / 8)
  const h = hover != null ? weeks[hover] : null
  const pct = (w: EasyHardWeek) => Math.round((w.easyS / (w.easyS + w.hardS)) * 100)

  return (
    <div className="flex flex-col gap-2">
      <Readout>
        {h ? (h.easyS + h.hardS > 0
          ? <>{h.label}: <b className="text-foreground">{pct(h)} % locker</b> ({fmtClock(h.easyS)}) · {100 - pct(h)} % hart ({fmtClock(h.hardS)})</>
          : <>{h.label}: keine Pulsdaten</>)
          : <><span className="text-teal">■</span> Z1+Z2 · <span className="text-brand">■</span> Z3–Z5 · Linie = 80 %</>}
      </Readout>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Anteil locker und hart pro Woche" onPointerLeave={() => setHover(null)}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{v} %</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x0 = L + i * bw + 1, bwid = Math.max(1.5, bw - 2), total = w.easyS + w.hardS
          const op = hover == null || hover === i ? 1 : 0.6
          return (
            <g key={w.key} onPointerEnter={() => setHover(i)}>
              {total > 0 ? (
                <>
                  <rect x={x0} width={bwid} y={y(100)} height={y(100 - (w.hardS / total) * 100) - y(100)} fill="hsl(var(--brand))" opacity={op} />
                  <rect x={x0} width={bwid} y={y((w.easyS / total) * 100)} height={y(0) - y((w.easyS / total) * 100)} fill="hsl(var(--teal))" opacity={op} />
                </>
              ) : <rect x={x0} width={bwid} y={y(100)} height={y(0) - y(100)} fill="hsl(var(--secondary))" />}
              <rect x={x0 - 1} y={T} width={bw} height={H - T - B} fill="transparent" />
              {i % labelEvery === 0 && <text x={x0 + bwid / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{w.label.split(' ').slice(-1)[0]}</text>}
            </g>
          )
        })}
        <line x1={L} x2={W - R} y1={y(80)} y2={y(80)} stroke="hsl(var(--foreground))" strokeDasharray="4 3" strokeWidth={1.5} />
      </svg>
    </div>
  )
}
