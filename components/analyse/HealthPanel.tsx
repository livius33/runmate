'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { Panel } from '@/components/runs/format'

type Day = { date: string; sleepMin: number | null; restingHr: number | null; hrvMs: number | null; steps: number | null; activeKcal: number | null; weightKg: number | null }
type Workout = { id: string; date: string; type: string; minutes: number; kcal: number | null; avgHr: number | null }

const sleep = (m: number | null) => (m == null ? '–' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`)
const n = (v: number | null, d = 0) => (v == null ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: d }))

// Apple Health (from the iOS Shortcut): last 7 days and non-running workouts. Shown only; not yet in load or readiness.
export function HealthPanel({ className }: { className?: string }) {
  const { data } = useQuery<{ days: Day[]; workouts: Workout[] }>({ queryKey: ['health-data'], queryFn: () => fetch('/api/health-data').then((r) => r.json()) })
  if (!data) return null
  const days = data.days.slice(0, 7)
  return (
    <Panel title="Apple Health" sub="letzte 7 Tage · Kurzbefehl" className={className}>
      {!days.length && !data.workouts.length ? (
        <p className="text-sm text-muted-foreground">Noch keine Daten. <Link href="/settings" className="text-brand hover:underline">Kurzbefehl einrichten →</Link></p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm tabular-nums">
              <thead><tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Tag</th><th className="py-1.5 pr-3 text-right font-medium">Schlaf</th>
                <th className="py-1.5 pr-3 text-right font-medium">Ruhepuls</th><th className="py-1.5 pr-3 text-right font-medium">HRV</th>
                <th className="py-1.5 pr-3 text-right font-medium">Schritte</th><th className="py-1.5 pr-3 text-right font-medium">Aktiv kcal</th>
                <th className="py-1.5 text-right font-medium">Gewicht</th>
              </tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.date} className="border-t border-border">
                    <td className="py-1.5 pr-3">{format(parseISO(d.date), 'EEEEEE d.M.', { locale: de })}</td>
                    <td className="py-1.5 pr-3 text-right">{sleep(d.sleepMin)}</td>
                    <td className="py-1.5 pr-3 text-right">{n(d.restingHr)}</td>
                    <td className="py-1.5 pr-3 text-right">{d.hrvMs == null ? '–' : `${n(d.hrvMs)} ms`}</td>
                    <td className="py-1.5 pr-3 text-right">{n(d.steps)}</td>
                    <td className="py-1.5 pr-3 text-right">{n(d.activeKcal)}</td>
                    <td className="py-1.5 text-right">{d.weightKg == null ? '–' : `${n(d.weightKg, 1)} kg`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.workouts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground">Andere Workouts (Apple Watch)</div>
              <ul className="mt-1.5 grid gap-1 text-sm">
                {data.workouts.slice(0, 8).map((w) => (
                  <li key={w.id} className="flex flex-wrap justify-between gap-2 tabular-nums">
                    <span>{format(parseISO(w.date), 'EEEEEE d.M.', { locale: de })} · {w.type}</span>
                    <span className="text-muted-foreground">{n(w.minutes)} Min.{w.kcal != null ? ` · ${w.kcal} kcal` : ''}{w.avgHr != null ? ` · Ø HF ${w.avgHr}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
