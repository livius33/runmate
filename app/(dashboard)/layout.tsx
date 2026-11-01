import { redirect } from 'next/navigation'
import { AppHeader, AppSidebar } from '@/components/AppHeader'
import { ScopeReady, UserScope } from '@/components/UserScope'
import { OfflineSupport } from '@/components/Offline'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { currentScope, UnauthorizedError } from '@/lib/scope'
import { getUserId, runAsUser } from '@/lib/server/scope'

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
  const { profile, blocks } = await runAsUser(userId, async () => ({ blocks: await ensureLiveBlocks(), profile: currentScope().profile }))
  return (
    <UserScope userId={userId} profile={profile} blocks={blocks}>
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <div className="min-w-0 flex-1">
          <AppHeader />
          <main className="mx-auto max-w-[1400px] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6"><OfflineSupport /><ScopeReady>{children}</ScopeReady></main>
        </div>
      </div>
    </UserScope>
  )
}
