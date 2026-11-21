'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { type PlanSession } from '@/lib/plan/types'
import { estimateDurationS, fmtDuration, fmtKm } from '@/lib/plan/format'
import { describeStructure, glossaryFor, sessionStructure, rescale, stridesCount, termsIn, totalKm } from '@/lib/plan/structure'
import { sessionTargets } from '@/lib/insights/today'
import { strengthDetail } from '@/lib/plan/strength'
import { cn } from '@/lib/utils'
import { Chip } from '@/components/ui/chip'

// Plan history that edits append to the notes ("verschoben auf …", "+3 km Ausgleich", …):
// shown under "Warum", not as part of the workout.
const HISTORY = /verschoben|nachgeholt|zusammengelegt|Rest .* km →|km von |Ausgleich|auf 0 km gesetzt|HF-Deckel|Ermüdungsschutz|Tempo neu kalibriert|geplant war/

export function splitNotes(notes?: string) {
  const parts = (notes ?? '').split(' · ').map((p) => p.trim()).filter(Boolean)
  return { workout: parts.filter((p) => !HISTORY.test(p)).join(' · '), history: parts.filter((p) => HISTORY.test(p)) }
}

// How to run a session: targets, duration, the structure in plain words, terms explained, and why
// the day looks like this. `compact` = one short line for lists.
export function SessionDetails({ session, why = [], compact = false }: { session: PlanSession; why?: string[]; compact?: boolean }) {
  const [term, setTerm] = useState<string | null>(null)
  if (session.type === 'rest') return null
  const { workout, history } = splitNotes(session.notes)
  // Easy runs never show a workout structure (e.g. "Locker statt Tempo-Intervalle").
  const parsed = sessionStructure({ type: session.type, notes: workout })
  // The day's km can differ from the structure (edited or moved km): show it fitted to the day,
  // or say plainly that it was planned for another distance.
  let structure = parsed, mismatch: string | null = null
  if (parsed && session.km && Math.abs(totalKm(parsed) - session.km) >= 1) {
    const r = rescale(parsed, session.km)
    if (r.ok) structure = r.structure
    else mismatch = `Ablauf für ${fmtKm(totalKm(parsed))} km geplant – an diesem Tag ${fmtKm(session.km)} km.`
  }
  const lines = structure ? describeStructure(structure) : []
  const strides = stridesCount(workout)
  const rest = (structure ? [structure.prefix.replace(/:\s*$/, ''), structure.suffix.replace(/^[.\s]+/, '')].filter(Boolean).join(' ') : workout)
    .replace(/^Mit \d+ Steigerungen( am Ende)?\.?$/, '')
  const targets = sessionTargets(session)
  const reasons = [...why, ...history]
  const kb = strengthDetail(session)                // kettlebell after the run

  if (compact) {
    return (
      <p className="mt-1.5 text-caption text-muted-foreground">
        {targets.join(' · ')}
        {lines.length > 0 && <> · {lines[1]}</>}
        {strides != null && <> · {strides} Steigerungen am Ende</>}
        {session.strength && <> · danach Kettlebell{session.strength.optional ? ' (optional)' : ''}</>}
      </p>
    )
  }

  const terms = termsIn(session.title, workout, session.date)
  const glossary = glossaryFor(session.date)
  return (
    <div className="mt-2 grid gap-2 text-body-sm">
      <div className="flex flex-wrap gap-1.5">
        {targets.map((t) => <Chip key={t} className="tabular-nums text-foreground">{t}</Chip>)}
        {session.km ? <Chip className="tabular-nums">ca. {fmtDuration(estimateDurationS(session))}</Chip> : null}
      </div>
      {lines.length > 0 && (
        <ol className="grid gap-0.5 text-body-sm">
          {lines.map((l, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground tabular-nums">{i + 1}.</span>{l}</li>)}
        </ol>
      )}
      {mismatch && <p className="text-caption text-warning">{mismatch}</p>}
      {strides != null && !structure && (
        <p className="text-body-sm">Am Ende {strides} Steigerungen: je ca. 20 s zügig bis etwa 5-km-Tempo, locker zurück.</p>
      )}
      {rest && <p className="text-caption text-muted-foreground">{rest}</p>}
      {kb && <p className="text-body-sm">{kb}</p>}
      {terms.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-caption">
          {terms.map((t) => (
            <button key={t} type="button" onClick={() => setTerm(term === t ? null : t)} aria-expanded={term === t}
              className={cn('tap inline-flex h-6 items-center gap-1 rounded-control px-2', term === t ? 'bg-secondary text-foreground shadow-hairline' : 'text-muted-foreground shadow-hairline hover:text-foreground')}>
              {t} <HelpCircle className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {term && <p className="rounded-card bg-secondary px-3 py-2 text-caption">{glossary[term]}</p>}
      {reasons.length > 0 && (
        <p className="text-caption"><span className="text-muted-foreground">Warum: </span>{reasons.join(' · ')}</p>
      )}
    </div>
  )
}
