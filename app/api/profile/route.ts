import { NextResponse } from 'next/server'
import { hrZones, raceHr } from '@/lib/analytics/hr'
import { resolveProfile, validateProfile } from '@/lib/profile'
import { loadOwnProfile, saveUserProfile } from '@/lib/profile-store'
import { withUser } from '@/lib/server/scope'
import { consentBlocked, given } from '@/lib/legal/intake'

export const runtime = 'nodejs'

// Health data in the profile (Art. 9): heart rates, VO2max and weight. Time zone, language, paces and PB times are not.
const HEALTH_FIELDS = ['hrMax', 'hrRest', 'lthr', 'pbHr', 'vo2max', 'weightKg'] as const

// What was stored (empty fields = defaults), what applies, and the zones and race caps that follow from it.
function view(stored: Awaited<ReturnType<typeof loadOwnProfile>>) {
  const resolved = resolveProfile(stored)
  return { stored, resolved, zones: hrZones(resolved), raceHr: { marathon: raceHr(42.195, resolved), half: raceHr(21.0975, resolved), tenK: raceHr(10, resolved) } }
}

// Mein Profil (Phase 2): HFmax, Ruhepuls, LTHR, Zonenmodell, Bestzeit, Gewicht, Zeitzone, Sprache.
export const GET = withUser(async () => NextResponse.json(view(await loadOwnProfile())))

export const PUT = withUser(async (req: Request) => {
  const parsed = validateProfile(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const blocked = await consentBlocked(HEALTH_FIELDS.some((k) => given(parsed.profile[k])))
  if (blocked) return blocked
  await saveUserProfile(parsed.profile)
  return NextResponse.json(view(parsed.profile))
})
