'use client'

// Fortschritt im Block (07-27): four progress charts per training block with one rule-based takeaway each.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import type { ProgressResponse } from '@/app/api/running/progress/route'
import type { Tone } from '@/lib/analytics/progress'
import { hrZones } from '@/lib/analytics/hr'
import { activeBlock, blocks } from '@/lib/plan/blocks'
import { Card } from '@/components/ui/card'
import { ChipButton } from '@/components/ui/chip'
import { cn } from '@/lib/utils'
import { CumulativeVolume, LongRunChart, QualityDots, Zone2Pace } from './progress-charts'

const DOT: Record<Tone, string> = { good: 'bg-teal', neutral: 'bg-muted-foreground', warn: 'bg-warning', bad: 'bg-brand' }

function Takeaway({ text, tone }: { text: string; tone: Tone }) {
  return (
    <p className="flex items-start gap-2 text-body-sm">
      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[tone])} aria-hidden />
      <span>{text}</span>
    </p>
  )
}

export function ProgressSection({ today, className }: { today: string; className?: string }) {
  const all = blocks()
  const [blockId, setBlockId] = useState(() => activeBlock(today).id)
  const { data, isLoading, isError } = useQuery<ProgressResponse>({
    queryKey: ['running-progress', blockId],
    queryFn: async () => {
      const r = await fetch(`/api/running/progress?block=${encodeURIComponent(blockId)}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    staleTime: 10 * 60 * 1000,
  })
  const p = data?.progress
  const z2 = hrZones()[1]
  const range = data ? `${format(parseISO(data.block.planStart), 'd.M.')}–${format(parseISO(data.block.end), 'd.M.yy')}` : ''

  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-title-sm">
          Fortschritt im Block
          {data && <span className="ml-2 text-body-sm font-normal text-muted-foreground">{data.block.name} · {range}</span>}
        </h2>
        {all.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trainingsblock">
            {all.map((b) => (
              <ChipButton key={b.id} selected={blockId === b.id} onClick={() => setBlockId(b.id)}>
                {b.base ? 'Grundlage' : b.race.shortName}
              </ChipButton>
            ))}
          </div>
        )}
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-card bg-card shadow-raised" />}
      {isError && <p className="text-body-sm text-error">Der Fortschritt konnte nicht geladen werden. Seite neu laden.</p>}

      {p && (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card stack title="Blockfortschritt" aside="geplante und gelaufene km, kumuliert" className="lg:col-span-7">
            <Takeaway {...p.volume} />
            <CumulativeVolume p={p} />
          </Card>
          <Card stack title="Longrun-Aufbau" aside="längste Einheit pro Woche" className="lg:col-span-5">
            <Takeaway {...p.long} />
            <LongRunChart p={p} />
          </Card>
          <Card stack title="Tempo in Zone 2" aside={`Median der km mit Puls ${z2.min}–${z2.max}`} className="lg:col-span-5">
            <Takeaway {...p.z2} />
            <Zone2Pace p={p} />
          </Card>
          <Card stack title="Renntempo-Blöcke" aside="Abweichung vom Zieltempo je Tempo-Einheit" className="lg:col-span-7">
            <Takeaway {...p.quality} />
            <QualityDots p={p} />
          </Card>
        </div>
      )}
    </section>
  )
}
