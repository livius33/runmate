import { exportUserData } from '@/lib/account/data'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Art. 20 GDPR: everything of the signed-in user as a ZIP (one JSON file per table). Never gated by the plan.
export const GET = withUser(async () => {
  const zip = await exportUserData()
  const day = new Date().toISOString().slice(0, 10)
  return new Response(zip as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="runmate-export-${day}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
})
