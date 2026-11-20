'use client'

import { useToday } from '@/lib/use-today'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO, startOfWeek, subDays, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { BEST_EFFORTS } from '@/lib/analytics/run-metrics'
import type { AnalyticsRun } from '@/app/api/running/analytics/route'
import { Panel, fmtClock, fmtNum, fmtPace } from '@/components/runs/format'
import { ConsistencyCalendar, EfficiencyTrend, FitnessForm, Intensity, PaceHrScatter, VolumeChart, WeeklyEasyHard, YearComparison, type Bucket, type EasyHardWeek, type FitnessPoint } from '@/components/analyse/charts'
import { cn } from '@/lib/utils'
import { HealthPanel } from '@/components/analyse/HealthPanel'
import { LoadBySport } from '@/components/analyse/LoadBySport'
import { ProgressSection } from '@/components/analyse/ProgressSection'

type Period = '4w' | '3m' | '12m' | 'all'
const PERIODS: { key: Period; label: string; days: number | null; prevLabel: string }[] = [
  { key: '4w', label: '4 Wochen', days: 28, prevLabel: 'zu den 4 Wochen davor' },
  { key: '3m', label: '3 Monate', days: 91, prevLabel: 'zu den 3 Monaten davor' },
  { key: '12m', label: '12 Monate', days: 365, prevLabel: 'zu den 12 Monaten davor' },
  { key: 'all', label: 'Alles', days: null, prevLabel: '' },
]

function totals(runs: AnalyticsRun[]) {
  return {
    km: runs.reduce((a, r) => a + r.km, 0),
    runs: runs.length,
    s: runs.reduce((a, r) => a + r.movingS, 0),
    elev: runs.reduce((a, r) => a + r.elevationM, 0),
  }
}

export default function AnalysePage() {
  const today = useToday()
  const [period, setPeriod] = useState<Period>('4w')
  const P = PERIODS.find((p) => p.key === period)!
  const { data: runs = [], isLoading, isError } = useQuery<AnalyticsRun[]>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const r = await fetch('/api/running/analytics')
      if (!r.ok) throw new Error()
      return r.json()
    },
  })

  // Fitness timeline for the chart window (at least 12 weeks for context)
  const fitnessDays = period === 'all' ? 4000 : Math.max(84, P.days!)
  const { data: fitness = [] } = useQuery<FitnessPoint[]>({
    queryKey: ['running-fitness', fitnessDays],
    queryFn: () => fetch(`/api/running/fitness?days=${fitnessDays}`).then((r) => (r.ok ? r.json() : [])),
    staleTime: 30 * 60 * 1000,
  })

  const view = useMemo(() => {
    if (!runs.length) return null
    const from = P.days ? format(subDays(parseISO(today), P.days - 1), 'yyyy-MM-dd') : runs[0].date
    const prevFrom = P.days ? format(subDays(parseISO(from), P.days), 'yyyy-MM-dd') : null
    const inPeriod = runs.filter((r) => r.date >= from && r.date <= today)
    const prev = prevFrom ? runs.filter((r) => r.date >= prevFrom && r.date < from) : null

    // Volume buckets: weekly up to 12 months (at least 12 weeks for context), monthly for "Alles"
    let buckets: Bucket[] = []
    if (period === 'all') {
      const first = parseISO(runs[0].date.slice(0, 7) + '-01')
      for (let d = first; format(d, 'yyyy-MM') <= today.slice(0, 7); d = subMonths(d, -1)) {
        const key = format(d, 'yyyy-MM'), rs = runs.filter((r) => r.date.startsWith(key))
        buckets.push({ key, label: format(d, 'MMM yy', { locale: de }), km: rs.reduce((a, r) => a + r.km, 0), runs: rs.length, partial: key === today.slice(0, 7) })
      }
    } else {
      const weeks = Math.max(12, Math.ceil(P.days! / 7))
      const monday = startOfWeek(parseISO(today), { weekStartsOn: 1 })
      buckets = Array.from({ length: weeks }, (_, i) => {
        const s = addDays(monday, -(weeks - 1 - i) * 7), a = format(s, 'yyyy-MM-dd'), b = format(addDays(s, 6), 'yyyy-MM-dd')
        const rs = runs.filter((r) => r.date >= a && r.date <= b)
        return { key: a, label: `Woche ab ${format(s, 'd.M.')}`, km: rs.reduce((x, r) => x + r.km, 0), runs: rs.length, partial: b >= today }
      })
    }

    // 80/20: easy (Z1+Z2) vs. hard (Z3–Z5) time per week; same weeks as the volume chart, last 52 for "Alles"
    const ehWeeks = period === 'all' ? 52 : Math.max(12, Math.ceil(P.days! / 7))
    const ehMonday = startOfWeek(parseISO(today), { weekStartsOn: 1 })
    const easyHard: EasyHardWeek[] = Array.from({ length: ehWeeks }, (_, i) => {
      const s = addDays(ehMonday, -(ehWeeks - 1 - i) * 7), a = format(s, 'yyyy-MM-dd'), b = format(addDays(s, 6), 'yyyy-MM-dd')
      const zs = runs.filter((r) => r.date >= a && r.date <= b && r.zonesS).map((r) => r.zonesS!)
      return {
        key: a, label: `Woche ab ${format(s, 'd.M.')}`,
        easyS: zs.reduce((t, z) => t + (z[0] ?? 0) + (z[1] ?? 0), 0),
        hardS: zs.reduce((t, z) => t + z.slice(2).reduce((u, v) => u + v, 0), 0),
      }
    })

    // Efficiency: easy runs, monthly; at least the last 12 months
    const effFrom = period === 'all' ? runs[0].date.slice(0, 7) : format(subMonths(parseISO(today), 11), 'yyyy-MM')
    const months: { key: string; eff: number | null; n: number }[] = []
    for (let d = parseISO(effFrom + '-01'); format(d, 'yyyy-MM') <= today.slice(0, 7); d = subMonths(d, -1)) {
      const key = format(d, 'yyyy-MM')
      const e = runs.filter((r) => r.date.startsWith(key) && (r.type === 'Locker' || r.type === 'Regeneration') && r.eff != null && r.eff > 0.7).map((r) => r.eff!)
      months.push({ key, eff: e.length ? e.reduce((a, b) => a + b, 0) / e.length : null, n: e.length })
    }

    // Personal bests: fastest stretch of each distance, all time and in the period
    const bests = BEST_EFFORTS.map((b) => {
      const pick = (rs: AnalyticsRun[]) => rs.filter((r) => r.best[b.key] != null).sort((x, y) => x.best[b.key]! - y.best[b.key]!)[0]
      return { ...b, all: pick(runs), period: pick(inPeriod) }
    }).filter((b) => b.all)
    const longest = [...runs].sort((a, b) => b.km - a.km)[0]

    return { inPeriod, cur: totals(inPeriod), prev: prev && totals(prev), buckets, easyHard, months, bests, longest }
  }, [runs, period, P, today])

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Deine Form</h1>

      <ProgressSection today={today} />

      <div className="flex flex-wrap items-baseline justify-between gap-3 pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Form im Zeitraum</h2>
        <div className="flex gap-1.5" role="group" aria-label="Zeitraum">
          {PERIODS.map((p) => (
            <button key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}
              className={cn('rounded-full border px-3 py-1 text-xs', period === p.key ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-2xl border border-border bg-card" />}
      {isError && <p className="text-sm text-brand">Die Analyse konnte nicht geladen werden. Seite neu laden.</p>}

      {view && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Distanz', value: `${fmtNum(view.cur.km)} km`, cur: view.cur.km, prev: view.prev?.km },
              { label: 'Läufe', value: String(view.cur.runs), cur: view.cur.runs, prev: view.prev?.runs },
              { label: 'Zeit', value: `${fmtNum(view.cur.s / 3600)} h`, cur: view.cur.s, prev: view.prev?.s },
              { label: 'Höhenmeter', value: `${fmtNum(view.cur.elev)} m`, cur: view.cur.elev, prev: view.prev?.elev },
            ].map((t) => {
              const d = t.prev ? Math.round(((t.cur - t.prev) / t.prev) * 100) : null
              return (
                <div key={t.label} className="rounded-2xl border border-border bg-card px-4 py-3.5">
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                  <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{t.value}</div>
                  <div className={cn('mt-0.5 text-xs tabular-nums', d == null || d === 0 ? 'text-muted-foreground' : d > 0 ? 'text-teal' : 'text-brand')}>
                    {d == null ? (period === 'all' ? `seit ${format(parseISO(runs[0].date), 'MMMM yyyy', { locale: de })}` : 'kein Vergleich')
                      : d === 0 ? `unverändert ${P.prevLabel}` : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} % ${P.prevLabel}`}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <Panel title="Umfang" sub={period === 'all' ? 'pro Monat' : 'pro Woche'} className="lg:col-span-7">
              <VolumeChart buckets={view.buckets} unit={period === 'all' ? 'Monat' : 'Woche'} />
            </Panel>
            <Panel title="Jahresvergleich" sub="kumulierte km" className="lg:col-span-5">
              <YearComparison runs={runs} today={today} />
            </Panel>

            <Panel title="Aerobe Effizienz" sub="Meter pro Herzschlag, lockere Läufe" className="lg:col-span-7">
              <EfficiencyTrend months={view.months} />
            </Panel>
            <Panel title="Konsistenz" sub="km pro Tag" className="lg:col-span-5">
              <ConsistencyCalendar runs={runs} today={today} />
            </Panel>

            <Panel title="Intensität" sub={`Pulszonen und Lauftypen · ${P.label}`} className="lg:col-span-7">
              <Intensity runs={view.inPeriod} />
            </Panel>
            <Panel title="Bestwerte" sub="schnellster Abschnitt in einem Lauf" className="lg:col-span-5">
              <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums">
                <thead><tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1.5 font-medium" />
                  <th className="pb-1.5 font-medium">Allzeit</th>
                  <th className="pb-1.5 font-medium">{P.label}</th>
                </tr></thead>
                <tbody>
                  {view.bests.map((b) => (
                    <tr key={b.key} className="border-t border-border">
                      <td className="py-2 pr-2">{b.label}</td>
                      <td className="py-2 pr-2">
                        <Link href={`/running/activities/${b.all!.id}`} className="hover:underline">
                          <b>{fmtClock(b.all!.best[b.key]!)}</b> <span className="text-muted-foreground">{format(parseISO(b.all!.date), 'd.M.yy')}</span>
                        </Link>
                      </td>
                      <td className="py-2">
                        {b.period ? (
                          <Link href={`/running/activities/${b.period.id}`} className="hover:underline">
                            {fmtClock(b.period.best[b.key]!)} <span className="text-muted-foreground">{fmtPace(b.period.best[b.key]! / (b.m / 1000))}/km</span>
                          </Link>
                        ) : <span className="text-muted-foreground">–</span>}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="py-2 pr-2">Längster Lauf</td>
                    <td className="py-2" colSpan={2}>
                      <Link href={`/running/activities/${view.longest.id}`} className="hover:underline">
                        <b>{fmtNum(view.longest.km, 1)} km</b> <span className="text-muted-foreground">{format(parseISO(view.longest.date), 'd.M.yy')}</span>
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table></div>
            </Panel>

            <Panel title="Tempo × Puls" sub={`ein Punkt pro Lauf · ${P.label}`} className="lg:col-span-7">
              <PaceHrScatter runs={view.inPeriod} />
            </Panel>
            <Panel title="80/20 pro Woche" sub="Zeit in Z1+Z2 vs. Z3–Z5" className="lg:col-span-5">
              <WeeklyEasyHard weeks={view.easyHard} />
            </Panel>

            <Panel title="Fitness & Form" sub="CTL · ATL · TSB" className="lg:col-span-12">
              <FitnessForm points={fitness} />
            </Panel>
            <Panel title="Belastung nach Sport" sub="TRIMP pro Woche · Laufen, Kraft, Schwimmen, Rad, Gym" className="lg:col-span-12">
              <LoadBySport today={today} weeks={period === 'all' ? 52 : Math.max(12, Math.ceil(P.days! / 7))} />
            </Panel>
            <HealthPanel className="lg:col-span-12" />
          </div>
        </>
      )}
    </div>
  )
}
