import type { RunType } from '@/lib/analytics/run-metrics'
import { Chip } from '@/components/ui/chip'

// Run type as a chip on the design tokens (12-02). The pill in ./format.tsx stays for the pages not yet moved over.
const TONE = {
  Locker: 'teal',
  Regeneration: 'teal',
  Tempo: 'brand',
  Intervalle: 'brand',
  Rennen: 'race',
  Longrun: 'warning',
  Laufband: 'neutral',
} as const satisfies Record<RunType, string>

export function RunTypeTag({ type, className }: { type: RunType; className?: string }) {
  return <Chip tone={TONE[type]} className={className}>{type}</Chip>
}
