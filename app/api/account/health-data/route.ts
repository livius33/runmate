import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteHealthData } from '@/lib/account/data'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// After revoking the health-data consent: delete activities, their streams and the Apple Health values.
export const DELETE = withUser(async (req: Request) => {
  const parsed = z.object({ confirm: z.literal(true) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bitte bestätigen.' }, { status: 400 })
  await deleteHealthData()
  return NextResponse.json({ ok: true })
})
