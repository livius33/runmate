import { NextResponse } from 'next/server'
import { z } from 'zod'
import { grantHealthConsent, healthConsent, revokeHealthConsent } from '@/lib/legal/consent'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// Art. 9 consent for health data (Settings → Gesundheitsdaten): status, grant (the version shown), revoke.
export const GET = withUser(async () => NextResponse.json(await healthConsent()))

export const PUT = withUser(async (req: Request) => {
  const parsed = z.object({ version: z.string().min(1).max(40), consent: z.literal(true) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bitte der Einwilligung ausdrücklich zustimmen.' }, { status: 400 })
  const r = await grantHealthConsent(parsed.data.version)
  return 'error' in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json(r)
})

// Revoking stops all intake at once (lib/legal/intake.ts); deleting the stored data is offered separately.
export const DELETE = withUser(async () => NextResponse.json(await revokeHealthConsent()))
