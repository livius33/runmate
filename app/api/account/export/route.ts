import { exportUserData } from '@/lib/account/data'
import { withUser } from '@/lib/server/scope'
import { LIMITS, throttle, waitText } from '@/lib/server/throttle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Art. 20 GDPR: everything of the signed-in user as a ZIP (one JSON file per table). Never gated by the plan; one
// export every two minutes per user (12-04). The settings page opens it as a plain link, so the cooldown is answered
// with readable text, not JSON.
const cooldownText = (seconds: number) => new Response(`Der Export wurde gerade erst erstellt. Bitte in ${waitText(seconds)} erneut versuchen.`, {
  status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': String(seconds), 'Cache-Control': 'no-store' },
})

export const GET = withUser(async () => {
  const limited = await throttle('export', LIMITS.export, cooldownText)
  if (limited) return limited
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
