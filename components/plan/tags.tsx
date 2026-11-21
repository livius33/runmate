import type { SessionType } from '@/lib/plan/types'
import { Chip } from '@/components/ui/chip'
import { TYPE_LABEL } from './ui'

// Session type as a chip on the design tokens (12-02). TypeTag in ./ui.tsx stays for the pages not yet moved over.
const TONE = {
  easy: 'teal',
  recovery: 'teal',
  tempo: 'brand',
  intervals: 'brand',
  long: 'warning',
  rest: 'neutral',
  race: 'race',
} as const satisfies Record<SessionType, string>

export function TypeTag({ type, className }: { type: SessionType; className?: string }) {
  return <Chip tone={TONE[type]} className={className}>{TYPE_LABEL[type]}</Chip>
}
