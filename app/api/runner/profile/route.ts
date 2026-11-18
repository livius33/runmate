import { NextResponse } from 'next/server'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { parseAnswers, type ProfileAnswers } from '@/lib/runner-profile-questions'
import { withUser } from '@/lib/server/scope'

const PROFILE_KEY = 'runner_profile'

// The answers as sent, checked against the questions (lib/runner-profile-questions.ts): keys that are no question are
// dropped, an answer of the wrong kind or no JSON object is a 400.
async function answers(req: Request) {
  return parseAnswers(await req.json().catch(() => null))
}
const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

export const GET = withUser(async () => {
  return NextResponse.json((await getSettingJson<ProfileAnswers>(PROFILE_KEY)) ?? {})
})

export const POST = withUser(async (req: Request) => {
  const sent = await answers(req)
  if (!sent.ok) return bad(sent.error)
  await setSettingJson(PROFILE_KEY, sent.answers)
  return NextResponse.json({ ok: true })
})

export const PATCH = withUser(async (req: Request) => {
  // Merge partial updates into existing profile. Only what comes in is checked: a profile stored before the check
  // stays as it is.
  const sent = await answers(req)
  if (!sent.ok) return bad(sent.error)
  const existing = (await getSettingJson<ProfileAnswers>(PROFILE_KEY)) ?? {}
  const merged = { ...existing, ...sent.answers }
  await setSettingJson(PROFILE_KEY, merged)
  return NextResponse.json({ ok: true, profile: merged })
})
