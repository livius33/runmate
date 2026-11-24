// Runs once when a server instance starts (Next.js instrumentation). 12-05: says in one line when billing is switched
// on but a Paddle setting is missing (lib/billing/config.ts), instead of failing at the first checkout.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logBillingConfig } = await import('@/lib/billing/config')
  logBillingConfig()
}
