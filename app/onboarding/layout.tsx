import { redirect } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { Providers } from '@/components/providers'
import { ScopeReady, UserScope } from '@/components/UserScope'
import { EntitlementsProvider } from '@/components/billing/Entitlements'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { currentScope, NotAllowedError, UnauthorizedError } from '@/lib/scope'
import { getUserId, runAsUser } from '@/lib/server/scope'
import { currentEntitlements, ensureSubscription } from '@/lib/billing/access'
import { toClient } from '@/lib/billing/entitlements'
import { needsOnboarding } from '@/lib/onboarding/store'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Runmate – Einrichten' }

// First sign-in (Phase 5): the onboarding, outside the dashboard shell. With billing on, the 30-day trial starts here
// (the first page a new account sees). Done or an account in use before: straight to the app.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  let userId: string
  try {
    userId = await getUserId()
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/sign-in')
    if (err instanceof NotAllowedError) redirect('/sign-in?error=unauthorized')
    throw err
  }
  const r = await runAsUser(userId, async () => {
    await ensureSubscription()
    if (!(await needsOnboarding())) return null
    return { blocks: await ensureLiveBlocks(), profile: currentScope().profile, entitlements: toClient(await currentEntitlements()) }
  })
  if (!r) redirect('/plan')
  return (
    <Providers>
      <UserScope userId={userId} profile={r.profile} blocks={r.blocks}>
        <EntitlementsProvider value={r.entitlements}>
          <div className="min-h-screen bg-background">
            <header className="mx-auto flex h-14 max-w-2xl items-center px-4 sm:px-6"><Logo /></header>
            <main className="mx-auto max-w-2xl px-4 pb-16 sm:px-6"><ScopeReady>{children}</ScopeReady></main>
          </div>
        </EntitlementsProvider>
      </UserScope>
    </Providers>
  )
}
