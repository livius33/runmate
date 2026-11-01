'use client'

// Registers the live training blocks in the browser (07-14) before any page component renders: the dashboard layout
// reads them on the server and passes them in, so client-side plan lookups (blocks.ts) see the same blocks.
import { registerLiveBlocks } from '@/lib/plan/blocks'
import type { TrainingBlock } from '@/lib/plan/types'

export function LiveBlocks({ blocks, children }: { blocks: TrainingBlock[]; children: React.ReactNode }) {
  registerLiveBlocks(blocks)
  return <>{children}</>
}
