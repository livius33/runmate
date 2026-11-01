import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteGarminAccount, garminAccountStatus, saveGarminCredentials } from '@/lib/garmin/account'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const Body = z.object({ username: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) })

// Save this user's Garmin login (encrypted at rest, lib/crypto.ts). The response says only that it is stored; the
// next sync logs in with it. Nothing about the values is logged.
export const PUT = withUser(async (req: Request) => {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'E-Mail und Passwort von Garmin Connect angeben.' }, { status: 400 })
  try {
    await saveGarminCredentials(parsed.data.username, parsed.data.password)
  } catch (err: any) {
    console.error('[garmin/account PUT]', err?.message ?? 'failed')
    return NextResponse.json({ error: 'Zugangsdaten konnten nicht gespeichert werden.' }, { status: 500 })
  }
  return NextResponse.json(await garminAccountStatus())
})

// Remove the Garmin login and session (synced activities stay).
export const DELETE = withUser(async () => {
  await deleteGarminAccount()
  return NextResponse.json(await garminAccountStatus())
})
