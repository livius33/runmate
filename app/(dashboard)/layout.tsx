import { redirect } from 'next/navigation'
import { ClerkProvider } from '@clerk/nextjs'
import { AppHeader, AppSidebar } from '@/components/AppHeader'
import { ScopeReady, UserScope } from '@/components/UserScope'
import { OfflineSupport } from '@/components/Offline'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { currentScope, UnauthorizedError } from '@/lib/scope'
import { getUserId, runAsUser } from '@/lib/server/scope'
import { currentEntitlements, ensureSubscription } from '@/lib/billing/access'
import { toClient } from '@/lib/billing/entitlements'
import { EntitlementsProvider } from '@/components/billing/Entitlements'
import { BillingNotice } from '@/components/billing/BillingNotice'
import { Providers } from '@/components/providers'
import { needsOnboarding } from '@/lib/onboarding/store'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let userId: string
  try {
    userId = await getUserId()
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/sign-in')
    throw err
  }
  // This user's profile and live blocks, handed to the browser's scope (components/UserScope.tsx).
  // With billing on, the first sign-in starts the 30-day trial (Phase 4); the entitlements drive the upsells.
  // A new account goes through the onboarding first (Phase 5).
  const r = await runAsUser(userId, async () => {
    if (await needsOnboarding()) return null
    await ensureSubscription()
    return { blocks: await ensureLiveBlocks(), profile: currentScope().profile, entitlements: toClient(await currentEntitlements()) }
  })
  if (!r) redirect('/onboarding')
  const { profile, blocks, entitlements } = r
  return (
    <ClerkProvider>
      <Providers>
        <UserScope userId={userId} profile={profile} blocks={blocks}>
          <EntitlementsProvider value={entitlements}>
            <div className="flex min-h-screen bg-background">
              <AppSidebar />
              <div className="min-w-0 flex-1">
                <AppHeader />
                <main className="mx-auto max-w-[1400px] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6"><OfflineSupport /><ScopeReady><BillingNotice />{children}</ScopeReady></main>
              </div>
            </div>
          </EntitlementsProvider>
        </UserScope>
      </Providers>
    </ClerkProvider>
  )
}
