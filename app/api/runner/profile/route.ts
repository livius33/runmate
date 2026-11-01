import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { ProfileAnswers } from '@/lib/runner-profile-questions'

const PROFILE_KEY = 'runner_profile'

export async function GET() {
  const [row] = await db.select().from(settings).where(eq(settings.key, PROFILE_KEY))
  if (!row) return NextResponse.json({})
  try {
    return NextResponse.json(JSON.parse(row.value))
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: Request) {
  const body: ProfileAnswers = await req.json()
  const value = JSON.stringify(body)

  await db
    .insert(settings)
    .values({ key: PROFILE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  // Merge partial updates into existing profile
  const partial: Partial<ProfileAnswers> = await req.json()

  const [row] = await db.select().from(settings).where(eq(settings.key, PROFILE_KEY))
  const existing: ProfileAnswers = row ? (() => { try { return JSON.parse(row.value) } catch { return {} } })() : {}

  const merged = { ...existing, ...partial }
  const value  = JSON.stringify(merged)

  await db
    .insert(settings)
    .values({ key: PROFILE_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })

  return NextResponse.json({ ok: true, profile: merged })
}
