'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { de } from 'date-fns/locale'
import type { LoadDay } from '@/app/api/cross-training/load/route'
import { SPORT_LABEL, type Sport } from '@/lib/analytics/cross-training'
import { CROSS_LOAD_FROM } from '@/lib/analytics/load'
import { fmtNum } from '@/components/runs/format'

// Analyse → Belastung nach Sport (08-04): weekly TRIMP stacked by sport, same weeks as the volume chart. Own file:
// components/analyse/charts.tsx belongs to the progress charts (07-27).

const SPORTS: Sport[] = ['run', 'strength', 'swim', 'bike', 'gym']
const COLOR: Record<Sport, string> = {
  run: '#3a74d4',                          // the Fitness line's blue
  strength: 'hsl(var(--brand))',
  swim: 'hsl(var(--teal))',
  bike: '#d97706',
  gym: 'hsl(var(--muted-foreground))',
}

function niceStep(max: number, n = 4) {
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw || 1))
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
}

interface Week { key: string; label: string; partial: boolean; by: Record<Sport, number>; total: number }

export function LoadBySport({ today, weeks }: { today: string; weeks: number }) {
  const days = weeks * 7 + 7
  const { data: loads = [], isLoading } = useQuery<LoadDay[]>({
    queryKey: ['cross-training-load', days],
    queryFn: () => fetch(`/api/cross-training/load?days=${days}`).then((r) => (r.ok ? r.json() : [])),
    staleTime: 30 * 60 * 1000,
  })
  const [hover, setHover] = useState<number | null>(null)

  const rows: Week[] = useMemo(() => {
    const monday = startOfWeek(parseISO(today), { weekStartsOn: 1 })
    return Array.from({ length: weeks }, (_, i) => {
      const s = addDays(monday, -(weeks - 1 - i) * 7), a = format(s, 'yyyy-MM-dd'), b = format(addDays(s, 6), 'yyyy-MM-dd')
      const by = { run: 0, strength: 0, swim: 0, bike: 0, gym: 0 }
      for (const d of loads) if (d.date >= a && d.date <= b) for (const sp of SPORTS) by[sp] += d[sp]
      return { key: a, label: `Woche ab ${format(s, 'd.M.')}`, partial: b >= today, by, total: SPORTS.reduce((t, sp) => t + by[sp], 0) }
    })
  }, [loads, today, weeks])

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />
  const used = SPORTS.filter((sp) => rows.some((w) => w.by[sp] > 0))
  if (!used.length) return <p className="text-sm text-muted-foreground">Noch keine Belastung in diesem Zeitraum.</p>

  const W = 1100, L = 38, R = 16, H = 220, T = 10, B = 22
  const max = Math.max(1, ...rows.map((w) => w.total)) * 1.08
  const step = niceStep(max), top = Math.ceil(max / step) * step
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const slot = (W - L - R) / rows.length, bw = Math.max(2, slot * 0.7)
  const x = (i: number) => L + slot * i + (slot - bw) / 2
  const cur = hover != null ? rows[hover] : rows[rows.length - 1]
  const labelEvery = Math.ceil(rows.length / 8)

  return (
    <div className="flex flex-col gap-2">
      <div className="min-h-[18px] text-xs text-muted-foreground tabular-nums">
        {cur.label}{cur.partial ? ' (läuft)' : ''}: <b className="text-foreground">{fmtNum(cur.total)}</b> gesamt
        {used.filter((sp) => cur.by[sp] > 0).map((sp) => <span key={sp}> · {SPORT_LABEL[sp]} {fmtNum(cur.by[sp])}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-none" role="img" aria-label="Belastung nach Sport pro Woche"
        onPointerLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="hsl(var(--border))" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtNum(v)}</text>
          </g>
        ))}
        {rows.map((w, i) => {
          let acc = 0
          return (
            <g key={w.key} onPointerEnter={() => setHover(i)} opacity={hover == null || hover === i ? 1 : 0.55}>
              <rect x={L + slot * i} width={slot} y={T} height={H - T - B} fill="transparent" />
              {used.map((sp) => {
                const v = w.by[sp]
                if (v <= 0) return null
                const y1 = y(acc + v), h = y(acc) - y1
                acc += v
                return <rect key={sp} x={x(i)} width={bw} y={y1} height={h} fill={COLOR[sp]} opacity={w.partial ? 0.55 : 0.9} rx={1} />
              })}
              {i % labelEvery === 0 && (
                <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{format(parseISO(w.key), 'd. MMM', { locale: de })}</text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {used.map((sp) => (
          <span key={sp} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[sp] }} />{SPORT_LABEL[sp]}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Laufen aus Dauer und Puls (TRIMP), Kraft und Schwimmen aus Minuten × RPE, Rad und Gym aus dem Puls. Kraft, Schwimmen, Rad
        und Gym zählen ab dem {format(parseISO(CROSS_LOAD_FROM), 'd.M.yyyy')} — nie in den Lauf-km.
      </p>
    </div>
  )
}
