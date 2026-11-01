import { AppHeader, AppSidebar } from '@/components/AppHeader'
import { LiveBlocks } from '@/components/plan/LiveBlocks'
import { OfflineSupport } from '@/components/Offline'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const live = await ensureLiveBlocks()
  return (
    <LiveBlocks blocks={live}>
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <div className="min-w-0 flex-1">
          <AppHeader />
          <main className="mx-auto max-w-[1400px] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6"><OfflineSupport />{children}</main>
        </div>
      </div>
    </LiveBlocks>
  )
}
