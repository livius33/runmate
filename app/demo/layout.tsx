import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppHeader, AppSidebar } from '@/components/AppHeader'
import { AppBaseProvider } from '@/components/AppBase'
import { ScopeReady, UserScope } from '@/components/UserScope'
import { EntitlementsProvider } from '@/components/billing/Entitlements'
import { DemoBridge } from '@/components/demo/DemoBridge'
import { Providers } from '@/components/providers'
import { SELF_HOST, toClient } from '@/lib/billing/entitlements'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { currentScope } from '@/lib/scope'
import { DEMO_USER_ID } from '@/lib/demo/athlete'
import { demoEnabled } from '@/lib/demo/store'
import { runAsDemo } from '@/lib/demo/serve'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Runmate – Demo', robots: { index: false } }

// The read-only demo (Phase 5, DEMO_MODE=1): the dashboard pages for the fictional demo athlete, without a login and
// without Clerk. Every read runs as the demo user (lib/demo/serve.ts), every write is refused.
export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoEnabled()) notFound()
  const { profile, blocks } = await runAsDemo(async () => ({ blocks: await ensureLiveBlocks(), profile: currentScope().profile }))
  return (
    <Providers>
      <AppBaseProvider value={{ base: '/demo', readOnly: true }}>
        <UserScope userId={DEMO_USER_ID} profile={profile} blocks={blocks}>
          <EntitlementsProvider value={toClient(SELF_HOST)}>
            <DemoBridge />
            <div className="flex min-h-screen bg-background">
              <AppSidebar />
              <div className="min-w-0 flex-1">
                <div className="border-b border-border bg-brand-soft px-4 py-2 text-center text-caption text-foreground sm:px-6">
                  <strong className="font-semibold">Demo – nur ansehen.</strong> Eine erfundene Läuferin auf dem Weg zum Hamburg HM;
                  alle Daten sind synthetisch und werden jede Nacht neu erzeugt. Änderungen werden nicht gespeichert.{' '}
                  <Link href="/sign-in" className="font-medium underline underline-offset-2 hover:no-underline">Eigenen Plan erstellen →</Link>
                </div>
                <AppHeader />
                <main className="mx-auto max-w-[1400px] p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6"><ScopeReady>{children}</ScopeReady></main>
              </div>
            </div>
          </EntitlementsProvider>
        </UserScope>
      </AppBaseProvider>
    </Providers>
  )
}
