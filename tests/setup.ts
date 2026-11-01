// FC_SEED=<n> npm test reproduces a fast-check run (the seed is printed with every failure).
import fc from 'fast-check'

const seed = process.env.FC_SEED
if (seed) fc.configureGlobal({ seed: Number(seed) })

// Most plan tests run against the hand-written example block (examples/porto-2026). The app itself starts with an
// empty registry; tests/plan/no-blocks.test.ts covers that.
import { registerBuiltInBlocks } from '@/lib/plan/blocks'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
registerBuiltInBlocks([PORTO_2026])
