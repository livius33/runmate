import { NextResponse } from 'next/server'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import type { ProfileAnswers } from '@/lib/runner-profile-questions'
import { withUser } from '@/lib/server/scope'

const PROFILE_KEY = 'runner_profile'

export const GET = withUser(async () => {
  return NextResponse.json((await getSettingJson<ProfileAnswers>(PROFILE_KEY)) ?? {})
})

export const POST = withUser(async (req: Request) => {
  const body: ProfileAnswers = await req.json()
  await setSettingJson(PROFILE_KEY, body)
  return NextResponse.json({ ok: true })
})

export const PATCH = withUser(async (req: Request) => {
  // Merge partial updates into existing profile
  const partial: Partial<ProfileAnswers> = await req.json()
  const existing = (await getSettingJson<ProfileAnswers>(PROFILE_KEY)) ?? {}
  const merged = { ...existing, ...partial }
  await setSettingJson(PROFILE_KEY, merged)
  return NextResponse.json({ ok: true, profile: merged })
})
