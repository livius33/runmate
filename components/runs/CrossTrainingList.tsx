'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import type { CrossSummary } from '@/lib/analytics/cross-view'
import { CROSS_LOAD_FROM } from '@/lib/analytics/load'
import { CrossEntryForm, RpeChips, SportPill, useCrossMutations } from '@/components/plan/CrossTrainingLog'
import { fmtNum } from './format'

const PAGE = 50
const fmtDate = (d: string) => format(parseISO(d), 'EEE d. MMM yyyy', { locale: de })

// Läufe page, a sport chosen (08-04): the sessions newest first, RPE chips in the row, manual rows deletable.
export function CrossTrainingList({ rows, today }: { rows: CrossSummary[]; today: string }) {
  const { setRpe, remove } = useCrossMutations()
  const [adding, setAdding] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const rpe = (r: CrossSummary) => <RpeChips value={r.rpe} onChange={(v) => setRpe.mutate({ id: r.id, rpe: v })} disabled={setRpe.isPending} />
  const del = (r: CrossSummary) => r.manual && (
    <button type="button" onClick={() => remove.mutate(r.id)} className="text-[11px] text-muted-foreground hover:text-brand">Löschen</button>
  )

  return (
    <>
      {adding
        ? <CrossEntryForm date={today} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        : <button type="button" onClick={() => setAdding(true)}
            className="tap inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary">
            <Plus className="h-3.5 w-3.5" /> Einheit eintragen
          </button>}

      {/* Phones: one card per session */}
      <ul className="flex flex-col gap-2 md:hidden">
        {!rows.length && <li className="text-sm text-muted-foreground">Noch keine Einheiten.</li>}
        {rows.slice(0, shown).map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card px-3.5 py-3 tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{fmtDate(r.date)}</span>
              <SportPill type={r.type} />
            </div>
            <div className="mt-1 text-sm">{r.name}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold">{r.minutes} Min.</span>
              {r.km != null && <span>{fmtNum(r.km, 1)} km</span>}
              <span className="text-muted-foreground">HF {r.hr ?? '–'}</span>
              <span className="text-muted-foreground">Belastung {r.load}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">{rpe(r)}{del(r)}</div>
          </li>
        ))}
      </ul>

      <div className="hidden rounded-2xl border border-border bg-card overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {['Datum', 'Sport', 'Name', 'Dauer', 'Distanz', 'Ø HF', 'RPE', 'Belastung', ''].map((h, i) => (
                <th key={h || i} className={`px-3 py-2.5 font-medium whitespace-nowrap ${i >= 3 && i <= 5 || i === 7 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={9} className="px-3 py-6 text-muted-foreground">Noch keine Einheiten.</td></tr>}
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 tabular-nums">
                <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-3 py-2.5"><SportPill type={r.type} /></td>
                <td className="px-3 py-2.5">{r.name}</td>
                <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{r.minutes} Min.</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground whitespace-nowrap">{r.km != null ? `${fmtNum(r.km, 1)} km` : '–'}</td>
                <td className="px-3 py-2.5 text-right">{r.hr ?? '–'}</td>
                <td className="px-3 py-2.5">{rpe(r)}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.load}</td>
                <td className="px-3 py-2.5 text-right">{del(r)}</td>
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
        Belastung in TRIMP wie bei den Läufen: Kraft und Schwimmen aus Minuten × RPE, Rad und Gym aus dem Puls (ohne Puls aus Minuten × RPE).
        Zählt in Fitness und Form ab dem {format(parseISO(CROSS_LOAD_FROM), 'd.M.yyyy')}, nie in den Lauf-km.
      </p>
    </>
  )
}
