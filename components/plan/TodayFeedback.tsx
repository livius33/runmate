'use client'

// Heute card (07-25): rate today's run in two taps, and see what the feedback rules say — pain → Pause (the Krank/Pause
// control sits right below), easy runs too hard → the suggestion waits in Plan anpassen. Hints only; no plan change here.
import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanSession } from '@/lib/plan/types'
import type { DatedRun } from '@/lib/plan/pace-check'
import type { PauseInput } from '@/lib/plan/pause'
import { feedbackHints, feedbackSignals, type FeedbackRun, type WeekFeedbackEntry } from '@/lib/feedback/rules'
import type { FeedbackByActivity } from '@/app/api/running/feedback/route'
import { EMPTY_FEEDBACK, RunFeedback } from '@/components/runs/RunFeedback'

type Data = { byActivity: FeedbackByActivity; week: (WeekFeedbackEntry & { start: string }) | null }

export function useRunFeedback() {
  return useQuery<Data>({
    queryKey: ['run-feedback'],
    queryFn: () => fetch('/api/running/feedback').then((r) => (r.ok ? r.json() : { byActivity: {}, week: null })),
  })
}

export function TodayFeedback({ today, sessions, runs, pauses }: { today: string; sessions: PlanSession[]; runs: DatedRun[]; pauses: PauseInput }) {
  const qc = useQueryClient()
  const { data } = useRunFeedback()
  const todays = [...runs.filter((r) => r.date === today)].sort((a, b) => b.km - a.km)[0]
  const fb = data?.byActivity[todays?.id ?? ''] ?? null
  const value = todays ? { rpe: fb?.rpe ?? null, feel: fb?.feel ?? null, pain: fb?.pain ?? null, note: fb?.note ?? null } : EMPTY_FEEDBACK

  const signals = useMemo(() => {
    if (!data) return []
    const fbRuns: FeedbackRun[] = runs.map((r) => { const e = data.byActivity[r.id]; return { ...r, rpe: e?.rpe ?? null, feel: e?.feel ?? null, pain: e?.pain ?? null } })
    return feedbackSignals({ today, sessions, feedback: { runs: fbRuns, week: data.week }, pauses })
  }, [data, runs, sessions, today, pauses])
  const hints = feedbackHints(signals)
  const tooHard = signals.find((s) => s.kind === 'easy-too-hard')
  const refresh = () => ['run-feedback', 'workshop'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

  if (!todays && !hints.length && !tooHard) return null
  return (
    <div className="mt-3 flex flex-col gap-2">
      {todays && <RunFeedback id={todays.id} value={value} onSaved={refresh} title="Wie war’s heute?" />}
      {hints.map((h) => (
        <p key={h.kind} className={cn('flex items-start gap-2 text-body-sm', h.tone === 'warn' ? 'text-warning' : 'text-foreground/80')}>
          {h.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />}
          <span>{h.text}</span>
        </p>
      ))}
      {tooHard && (
        <p className="flex items-start gap-2 text-body-sm text-warning">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{tooHard.why[0]} <Link href="/plan/anpassen" className="font-medium underline underline-offset-2">Vorschlag unter Plan anpassen →</Link></span>
        </p>
      )}
    </div>
  )
}
