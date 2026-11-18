import { NextResponse } from 'next/server'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import type { ProfileAnswers } from '@/lib/runner-profile-questions'
import { withUser } from '@/lib/server/scope'

const PROFILE_KEY = 'runner_profile'

// The answers as sent, or null when the body is no JSON object (→ 400, like the other routes).
async function answers(req: Request): Promise<ProfileAnswers | null> {
  const body = await req.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null
}
const badBody = () => NextResponse.json({ error: 'JSON-Objekt erwartet' }, { status: 400 })

export const GET = withUser(async () => {
  return NextResponse.json((await getSettingJson<ProfileAnswers>(PROFILE_KEY)) ?? {})
})

export const POST = withUser(async (req: Request) => {
  const body = await answers(req)
  if (!body) return badBody()
  await setSettingJson(PROFILE_KEY, body)
  return NextResponse.json({ ok: true })
})

export const PATCH = withUser(async (req: Request) => {
  // Merge partial updates into existing profile
  const partial = await answers(req)
  if (!partial) return badBody()
  const existing = (await getSettingJson<ProfileAnswers>(PROFILE_KEY)) ?? {}
  const merged = { ...existing, ...partial }
  await setSettingJson(PROFILE_KEY, merged)
  return NextResponse.json({ ok: true, profile: merged })
})
