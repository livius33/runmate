import { notFound } from 'next/navigation'
import PlanPage from '@/app/(dashboard)/plan/page'
import AnalysePage from '@/app/(dashboard)/running/page'
import RunsPage from '@/app/(dashboard)/running/activities/page'
import RunPage from '@/app/(dashboard)/running/activities/[id]/page'
import SeasonPage from '@/app/(dashboard)/season/page'
import RacePage from '@/app/(dashboard)/race/page'
import WorkshopPage from '@/app/(dashboard)/plan/anpassen/page'

export const dynamic = 'force-dynamic'

// The dashboard pages the demo shows (Phase 5), by their in-app path. Left out: Settings (account, sources, billing)
// and "Neuer Plan" (it saves drafts). '' and 'plan' are both the Plan page (Phase 6 moves it to /plan).
const PAGES: Record<string, () => React.ReactNode> = {
  '': () => <PlanPage />,
  plan: () => <PlanPage />,
  running: () => <AnalysePage />,
  'running/activities': () => <RunsPage />,
  season: () => <SeasonPage />,
  race: () => <RacePage />,
  'plan/anpassen': () => <WorkshopPage />,
}

export default async function DemoPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path ?? []
  const key = path.join('/')
  if (path.length === 3 && key.startsWith('running/activities/') && /^[\w.-]{1,80}$/.test(path[2])) {
    return <RunPage params={Promise.resolve({ id: path[2] })} />
  }
  const page = PAGES[key]
  if (!page) notFound()
  return page()
}
