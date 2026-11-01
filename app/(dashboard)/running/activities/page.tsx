'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { RUN_TYPES, type RunType } from '@/lib/analytics/run-metrics'
import type { RunSummary } from '@/lib/analytics/run-view'
import { RunTypeTag, fmtClock, fmtNum, fmtPace, percentile } from '@/components/runs/format'
import { CrossTrainingList } from '@/components/runs/CrossTrainingList'
import { useCrossTraining } from '@/components/plan/CrossTrainingLog'
import { CROSS_SPORTS, CROSS_TYPES, type CrossType } from '@/lib/analytics/cross-training'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'

type SortKey = 'date' | 'km' | 'paceS' | 'hr' | 'effMpb'
const COLUMNS: { key: SortKey | null; label: string; align?: 'right' }[] = [
  { key: 'date', label: 'Datum' },
  { key: null, label: 'Typ' },
  { key: 'km', label: 'Distanz', align: 'right' },
  { key: null, label: 'Zeit', align: 'right' },
  { key: 'paceS', label: 'Pace', align: 'right' },
  { key: 'hr', label: 'Ø HF', align: 'right' },
  { key: null, label: 'Kadenz', align: 'right' },
  { key: null, label: 'Höhe', align: 'right' },
  { key: 'effMpb', label: 'Effizienz' },
]
const PAGE = 50

export default function RunsPage() {
  const router = useRouter()
  const { data: runs = [], isLoading, isError } = useQuery<RunSummary[]>({
    queryKey: ['runs'],
    queryFn: async () => {
      const r = await fetch('/api/running/runs')
      if (!r.ok) throw new Error()
      return r.json()
    },
  })
  const [type, setType] = useState<RunType | 'Alle'>('Alle')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [shown, setShown] = useState(PAGE)
  // Cross-training (08-04): a sport row above the run types; Läufe stays the default and unchanged.
  const today = useToday()
  const { data: cross = [] } = useCrossTraining()
  const [sport, setSport] = useState<CrossType | 'Läufe'>('Läufe')
  const sportCounts = useMemo(() => {
    const c: Partial<Record<CrossType, number>> = {}
    for (const r of cross) c[r.type] = (c[r.type] ?? 0) + 1
    return c
  }, [cross])
  const crossRows = useMemo(() => (sport === 'Läufe' ? [] : cross.filter((r) => r.type === sport)), [cross, sport])

  const counts = useMemo(() => {
    const c: Partial<Record<RunType, number>> = {}
    for (const r of runs) c[r.runType] = (c[r.runType] ?? 0) + 1
    return c
  }, [runs])

  const rows = useMemo(() => {
    const list = runs.filter((r) => type === 'Alle' || r.runType === type)
    const v = (r: RunSummary) => (sort.key === 'date' ? r.date + (r.startTime ?? '') : r[sort.key])
    return [...list].sort((a, b) => {
      const x = v(a), y = v(b)
      if (x == null) return 1
      if (y == null) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [runs, type, sort])

  // Efficiency bar is scaled within the current selection
  const effs = rows.map((r) => r.effMpb).filter((e): e is number => e != null)
  const effMin = percentile(effs, 0.05), effMax = percentile(effs, 0.95)

  const totalKm = rows.reduce((t, r) => t + r.km, 0)

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'paceS' ? 1 : -1 }))
    setShown(PAGE)
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{sport === 'Läufe' ? 'Läufe' : CROSS_SPORTS[sport].label}</h1>
        {sport !== 'Läufe' ? (
          <span className="text-sm text-muted-foreground tabular-nums">
            {crossRows.length} Einheiten · {fmtNum(crossRows.reduce((t, r) => t + r.minutes, 0) / 60, 1)} h
          </span>
        ) : !isLoading && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {rows.length} Läufe · {fmtNum(totalKm)} km
          </span>
        )}
      </div>

      {cross.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sport">
          {(['Läufe', ...CROSS_TYPES] as const).filter((s) => s === 'Läufe' || sportCounts[s]).map((s) => (
            <button key={s} aria-pressed={sport === s} onClick={() => { setSport(s); setShown(PAGE) }}
              className={cn('tap rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                sport === s ? 'border-brand bg-brand text-white' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {s === 'Läufe' ? 'Läufe' : CROSS_SPORTS[s].label} <span className="tabular-nums opacity-70">{s === 'Läufe' ? runs.length : sportCounts[s]}</span>
            </button>
          ))}
        </div>
      )}

      {sport !== 'Läufe' ? <CrossTrainingList rows={crossRows} today={today} /> : <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lauftyp">
        {(['Alle', ...RUN_TYPES] as const).filter((t) => t === 'Alle' || counts[t]).map((t) => (
          <button key={t} aria-pressed={type === t} onClick={() => { setType(t); setShown(PAGE) }}
            className={cn('tap rounded-full border px-3 py-1 text-xs transition-colors',
              type === t ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
            {t} <span className="tabular-nums opacity-70">{t === 'Alle' ? runs.length : counts[t]}</span>
          </button>
        ))}
      </div>

      {/* Phones: one card per run */}
      <ul className="flex flex-col gap-2 md:hidden">
        {isLoading && <li className="text-sm text-muted-foreground">Läufe werden geladen…</li>}
        {isError && <li className="text-sm text-brand">Läufe konnten nicht geladen werden. Seite neu laden.</li>}
        {rows.slice(0, shown).map((r) => (
          <li key={r.id}>
            <Link href={`/running/activities/${r.id}`} className="block rounded-xl border border-border bg-card px-3.5 py-3 tabular-nums active:bg-secondary">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{format(parseISO(r.date), 'EEE d. MMM yyyy', { locale: de })}</span>
                <RunTypeTag type={r.runType} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">{fmtNum(r.km, 1)} km</span>
                <span>{fmtPace(r.paceS)} /km</span>
                <span className="text-muted-foreground">{fmtClock(r.movingS)}</span>
                <span className="text-muted-foreground">HF {r.hr ?? '–'}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden rounded-2xl border border-border bg-card overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {COLUMNS.map((c) => (
                <th key={c.label} className={cn('px-3 py-2.5 font-medium whitespace-nowrap', c.align === 'right' && 'text-right')}>
                  {c.key ? (
                    <button onClick={() => toggleSort(c.key!)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {c.label}
                      {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="px-3 py-6 text-muted-foreground">Läufe werden geladen…</td></tr>}
            {isError && <tr><td colSpan={9} className="px-3 py-6 text-brand">Läufe konnten nicht geladen werden. Seite neu laden.</td></tr>}
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id} onClick={() => router.push(`/running/activities/${r.id}`)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50 tabular-nums">
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Link href={`/running/activities/${r.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                    {format(parseISO(r.date), 'EEE d. MMM yyyy', { locale: de })}
                  </Link>
                </td>
                <td className="px-3 py-2.5"><RunTypeTag type={r.runType} /></td>
                <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{fmtNum(r.km, 1)} km</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{fmtClock(r.movingS)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtPace(r.paceS)} /km</td>
                <td className="px-3 py-2.5 text-right">{r.hr ?? '–'}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.cadence ?? '–'}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground whitespace-nowrap">{r.elevationM != null ? `${r.elevationM} m` : '–'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {r.effMpb != null ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 rounded-full bg-teal"
                        style={{ width: `${6 + 50 * (effMax > effMin ? Math.min(1, Math.max(0, (r.effMpb - effMin) / (effMax - effMin))) : 0.5)}px` }} />
                      {fmtNum(r.effMpb, 2)}
                    </span>
                  ) : <span className="text-muted-foreground">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > shown && (
        <button onClick={() => setShown(shown + PAGE)}
          className="self-center rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary">
          Weitere {Math.min(PAGE, rows.length - shown)} von {rows.length - shown} anzeigen
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        Effizienz = Meter pro Herzschlag (Tempo geteilt durch Puls). Höher heißt: gleiches Tempo bei weniger Puls.
      </p>
      </>}
    </div>
  )
}
