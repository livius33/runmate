// DB side of the onboarding (Phase 5): settings 'onboarding' holds the state (lib/onboarding/flow.ts); every event is
// checked against what is actually stored before it is applied — consent granted, profile saved, a source connected
// or a run imported, a plan live — so the flow cannot be clicked through. Server only.
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { getSetting, getSettingJson, getSettings, setSetting, setSettingJson } from '@/lib/db/settings'
import { todayLocal } from '@/lib/dates'
import { hasHealthConsent } from '@/lib/legal/consent'
import { healthConsentRequired } from '@/lib/billing/config'
import { loadOwnProfile, saveUserProfile } from '@/lib/profile-store'
import { loadProfile, saveProfile } from '@/lib/plan/workshop-store'
import { BASE_KEY, LIVE_BLOCKS_KEY, ensureLiveBlocks, parseBase, readLiveEntries } from '@/lib/plan/live-blocks'
import { SOURCES } from '@/lib/sources/registry'
import { SEASON_KEY } from '@/lib/season/goals'
import { apply, currentStep, newState, stepsFor, storedState, type OnboardingEvent, type OnboardingState } from './flow'
import { buildProfiles, type ProfileInput } from './profile'

export const ONBOARDING_KEY = 'onboarding'

export const loadOnboarding = async () => storedState(await getSettingJson<unknown>(ONBOARDING_KEY))
const save = (s: OnboardingState) => setSettingJson(ONBOARDING_KEY, s)
const steps = () => stepsFor({ consentRequired: healthConsentRequired() })
const nowIso = () => new Date().toISOString()
const nextMonday = (today: string) => format(addDays(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 7), 'yyyy-MM-dd')

// Any sign that the account was used before: a profile, a run, a plan, a training profile or a season.
async function hasTrace(): Promise<boolean> {
  const [profile, run, rows] = await Promise.all([loadOwnProfile(), hasActivity(), getSettings([LIVE_BLOCKS_KEY, 'athlete_profile', SEASON_KEY])])
  return !!profile || run || rows.size > 0
}

// Should this user be sent to /onboarding? A started, unfinished flow: yes. No state: a new account (no trace) yes;
// an account in use before the onboarding existed is marked completed once and never sees it.
export async function needsOnboarding(): Promise<boolean> {
  const s = await loadOnboarding()
  if (s) return !s.completedAt
  if (!(await hasTrace())) return true
  await save({ ...newState(nowIso()), completedAt: nowIso(), existing: true })
  return false
}

const hasActivity = async () => (await db.select({ id: activities.id }).from(activities).where(own(activities)).limit(1)).length > 0

async function sourceConnected(): Promise<boolean> {
  const status = await Promise.all(SOURCES.filter((s) => s.meta.available && s.meta.capabilities.mode !== 'upload')
    .map((s) => s.status().then((x) => x.connected).catch(() => false)))
  return status.some(Boolean) || hasActivity()
}

export async function onboardingView() {
  const s = (await loadOnboarding()) ?? newState(nowIso())
  const list = steps()
  const [consent, user, athlete, connected, runs, live, base] = await Promise.all([
    hasHealthConsent(), loadOwnProfile(), loadProfile(), sourceConnected(), hasActivity(), readLiveEntries(), getSetting(BASE_KEY),
  ])
  return {
    state: s, steps: list, current: currentStep(s, list),
    consentRequired: list.includes('consent'), consentGranted: consent,
    profile: user, athlete, sourceConnected: connected, hasRuns: runs,
    live: live.map((e) => ({ id: e.block.id, name: e.block.race.name, planStart: e.block.planStart })),
    baseStart: parseBase(base ?? undefined).start ?? null, nextMonday: nextMonday(todayLocal()),
  }
}
export type OnboardingView = Awaited<ReturnType<typeof onboardingView>>

export type OnboardingRequest = OnboardingEvent & { profile?: ProfileInput }

// One event, its precondition checked on the server. German error or the new state (plus notes, e.g. the HFmax estimate).
export async function applyOnboarding(req: OnboardingRequest): Promise<{ error: string } | { state: OnboardingState; notes: string[] }> {
  const s = (await loadOnboarding()) ?? newState(nowIso())
  const list = steps()
  const notes: string[] = []
  if (req.type === 'complete') {
    if (req.step === 'consent' && !(await hasHealthConsent())) return { error: 'Bitte zuerst einwilligen – ohne Einwilligung kann Runmate keine Gesundheitsdaten verarbeiten.' }
    if (req.step === 'profile') {
      if (!req.profile) return { error: 'Profil fehlt.' }
      const built = buildProfiles(req.profile, await loadProfile())
      if (!built.ok) return { error: built.error }
      // Only check the step order before writing anything.
      const check = apply(s, req, list, nowIso())
      if (!check.ok) return { error: check.error }
      await saveUserProfile(built.user)
      await saveProfile(built.athlete)
      notes.push(...built.notes)
    }
    if (req.step === 'source' && !(await sourceConnected())) return { error: 'Noch keine Quelle verbunden und keine Läufe importiert. Verbinde eine Quelle oder überspringe den Schritt.' }
    if (req.step === 'goal' && !(await readLiveEntries()).some((e) => e.block.end >= todayLocal())) return { error: 'Noch kein Plan live. Übernimm einen Plan oder wähle „Erstmal ohne Ziel“.' }
  }
  const r = apply(s, req, list, nowIso())
  if (!r.ok) return { error: r.error }
  if (req.type === 'skip' && req.step === 'goal') {
    // "Erstmal ohne Ziel": a base block from next Monday (lib/plan/base-block.ts), until a goal block takes its weeks.
    const old = parseBase((await getSetting(BASE_KEY)) ?? undefined)
    await setSetting(BASE_KEY, JSON.stringify({ ...old, paused: false, start: nextMonday(todayLocal()) }))
    await ensureLiveBlocks(true)
  }
  await save(r.state)
  return { state: r.state, notes }
}
