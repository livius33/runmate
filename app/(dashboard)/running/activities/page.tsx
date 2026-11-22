'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAppHref } from '@/components/AppBase'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { RUN_TYPES, type RunType } from '@/lib/analytics/run-metrics'
import type { RunSummary } from '@/lib/analytics/run-view'
import { fmtClock, fmtNum, fmtPace, percentile } from '@/components/runs/format'
import { RunTypeTag } from '@/components/runs/tags'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChipButton } from '@/components/ui/chip'
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
  const href = useAppHref()          // the demo mounts the app under /demo (Phase 5)
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
        <h1 className="text-title">{sport === 'Läufe' ? 'Läufe' : CROSS_SPORTS[sport].label}</h1>
        {sport !== 'Läufe' ? (
          <span className="text-body-sm text-muted-foreground tabular-nums">
            {crossRows.length} Einheiten · {fmtNum(crossRows.reduce((t, r) => t + r.minutes, 0) / 60, 1)} h
          </span>
        ) : !isLoading && (
          <span className="text-body-sm text-muted-foreground tabular-nums">
            {rows.length} Läufe · {fmtNum(totalKm)} km
          </span>
        )}
      </div>

      {cross.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sport">
          {(['Läufe', ...CROSS_TYPES] as const).filter((s) => s === 'Läufe' || sportCounts[s]).map((s) => (
            <ChipButton key={s} selected={sport === s} onClick={() => { setSport(s); setShown(PAGE) }}>
              {s === 'Läufe' ? 'Läufe' : CROSS_SPORTS[s].label} <span className="tabular-nums opacity-70">{s === 'Läufe' ? runs.length : sportCounts[s]}</span>
            </ChipButton>
          ))}
        </div>
      )}

      {sport !== 'Läufe' ? <CrossTrainingList rows={crossRows} today={today} /> : !isLoading && !isError && runs.length === 0 ? (
        <Card as="div" className="text-body-sm">
          <p className="text-body font-semibold">Noch keine Läufe.</p>
          <p className="mt-1 max-w-prose text-muted-foreground">
            Verbinde eine Datenquelle oder lade Dateien von deiner Uhr hoch (FIT, GPX, TCX). Danach stehen hier deine Läufe, und der Plan rechnet mit dem, was du wirklich gelaufen bist.
          </p>
          <Button asChild variant="primary" className="mt-4">
            <Link href={href('/settings#datenquellen')}>Datenquelle verbinden</Link>
          </Button>
        </Card>
      ) : <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lauftyp">
        {(['Alle', ...RUN_TYPES] as const).filter((t) => t === 'Alle' || counts[t]).map((t) => (
          <ChipButton key={t} selected={type === t} onClick={() => { setType(t); setShown(PAGE) }}>
            {t} <span className="tabular-nums opacity-70">{t === 'Alle' ? runs.length : counts[t]}</span>
          </ChipButton>
        ))}
      </div>

      {/* Phones: one card per run */}
      <ul className="flex flex-col gap-2 md:hidden">
        {isLoading && <li className="text-body-sm text-muted-foreground">Läufe werden geladen…</li>}
        {isError && <li className="text-body-sm text-error">Läufe konnten nicht geladen werden. Seite neu laden.</li>}
        {rows.slice(0, shown).map((r) => (
          <li key={r.id}>
            <Link href={`/running/activities/${r.id}`} className="block rounded-card bg-card px-4 py-3 shadow-raised tabular-nums active:bg-secondary">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-body-sm font-medium">{format(parseISO(r.date), 'EEE d. MMM yyyy', { locale: de })}</span>
                <RunTypeTag type={r.runType} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
                <span className="font-semibold">{fmtNum(r.km, 1)} km</span>
                <span>{fmtPace(r.paceS)} /km</span>
                <span className="text-muted-foreground">{fmtClock(r.movingS)}</span>
                <span className="text-muted-foreground">HF {r.hr ?? '–'}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-card bg-card shadow-raised md:block">
        <table className="w-full min-w-[760px] text-body-sm">
          <thead>
            <tr className="border-b border-border text-left text-caption text-muted-foreground">
              {COLUMNS.map((c) => (
                <th key={c.label} className={cn('px-3 py-2.5 font-medium whitespace-nowrap', c.align === 'right' && 'text-right')}>
                  {c.key ? (
                    <button onClick={() => toggleSort(c.key!)} className="tap inline-flex items-center gap-1 hover:text-foreground">
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
            {isError && <tr><td colSpan={9} className="px-3 py-6 text-error">Läufe konnten nicht geladen werden. Seite neu laden.</td></tr>}
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id} onClick={() => router.push(href(`/running/activities/${r.id}`))}
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
                <td className="px-3 py-2.5 text-right text-muted-foreground whitespace-nowrap">{r.elevationM != null ? `${fmtNum(r.elevationM)} m` : '–'}</td>
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
        <Button onClick={() => setShown(shown + PAGE)} className="self-center">
          Weitere {Math.min(PAGE, rows.length - shown)} von {rows.length - shown} anzeigen
        </Button>
      )}
      <p className="text-caption text-muted-foreground">
        Effizienz = Meter pro Herzschlag (Tempo geteilt durch Puls). Höher heißt: gleiches Tempo bei weniger Puls.
      </p>
      </>}
    </div>
  )
}
