// AC-2, AC-3, AC-5 (Phase 5): who is sent to the onboarding (a new account yes, an account in use no — it is marked
// done once), the server's preconditions per step (consent granted, profile saved, a plan live), the goal-less base
// block from next Monday, and the dashboard layout's redirect. DB = the pg-proxy fake with a small settings store.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { activities, userProfile } from '@/lib/db/schema'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { baseBlocks } from '@/lib/plan/base-block'
import { NO_BLOCK } from '@/lib/plan/blocks'
import { useFakeDb, rowOf, type Query } from '../scope/fake-db'

const clerk = vi.hoisted(() => ({ userId: 'user_new' as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))
const nav = vi.hoisted(() => ({ redirects: [] as string[] }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { nav.redirects.push(to); throw new Error(`REDIRECT ${to}`) },
  notFound: () => { throw new Error('NOT_FOUND') },
  usePathname: () => '/', useRouter: () => ({ push: () => {} }), useSearchParams: () => new URLSearchParams(),
}))

const db = { settings: new Map<string, string>(), profile: false, run: false }
const settingsRows = (q: Query) => {
  const keys = q.params.slice(1).map(String)
  return [...db.settings].filter(([k]) => keys.includes(k)).map(([k, v]) => (/select "value"/.test(q.sql) ? [v] : [k, v]))
}
const fake = useFakeDb((q) => {
  if (/^insert into "settings"/.test(q.sql)) { db.settings.set(String(q.params[1]), String(q.params[2])); return [] }
  if (/^select .* from "settings"/.test(q.sql)) return settingsRows(q)
  if (/^select .* from "user_profile"/.test(q.sql)) return db.profile ? [rowOf(userProfile, { userId: q.params[0], hrMax: 180, updatedAt: 0 })] : []
  if (/^insert into "user_profile"/.test(q.sql)) { db.profile = true; return [] }
  if (/^select .* from "activities"/.test(q.sql)) return db.run ? [rowOf(activities, { id: 'a1' }).slice(0, 1)] : []
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { db.settings.clear(); db.profile = false; db.run = false; fake.log.length = 0; nav.redirects = []; delete process.env.REQUIRE_HEALTH_CONSENT })

const { runAsUser } = await import('@/lib/server/scope')
const { needsOnboarding, applyOnboarding } = await import('@/lib/onboarding/store')
const asUser = <T,>(fn: () => Promise<T>) => runAsUser('user_new', fn, { profile: null })
const writesTo = (key: string) => fake.log.filter((q) => q.sql.startsWith('insert into "settings"') && q.params[1] === key)
const stored = (key: string) => JSON.parse(db.settings.get(key) ?? 'null')

const PROFILE = { hrMax: null, hrMaxUnknown: true, age: 40, hrRest: null, race: null, weightKg: null, timezone: 'Europe/Berlin', weeklyKm: 32, experience: null, runDays: [1, 3, 5, 7], longRunDay: 7 }

describe('Wer die Einrichtung sieht (AC-2)', () => {
  it('neues Konto (keine Spuren, kein Zustand): ja, und nichts wird geschrieben', async () => {
    expect(await asUser(needsOnboarding)).toBe(true)
    expect(fake.log.filter((q) => q.sql.startsWith('insert'))).toEqual([])
  })

  it('Konto mit Spuren (Profil, Lauf oder Plan) ohne Zustand: nein – einmal als erledigt markiert', async () => {
    for (const trace of ['profile', 'run', 'plan'] as const) {
      db.settings.clear(); fake.log.length = 0
      db.profile = trace === 'profile'; db.run = trace === 'run'
      if (trace === 'plan') db.settings.set('plan_blocks', '{"v":1,"blocks":[]}')
      expect(await asUser(needsOnboarding), trace).toBe(false)
      expect(stored('onboarding')).toMatchObject({ existing: true, completedAt: expect.any(String) })
      fake.log.length = 0
      expect(await asUser(needsOnboarding), trace).toBe(false)
      expect(fake.log.filter((q) => q.sql.startsWith('insert'))).toEqual([])          // read once, never again written
    }
  })

  it('begonnen, nicht fertig: ja; fertig: nein', async () => {
    db.profile = true
    db.settings.set('onboarding', JSON.stringify({ v: 1, done: ['profile'], skipped: [], at: null, goal: null, startedAt: 'x', completedAt: null }))
    expect(await asUser(needsOnboarding)).toBe(true)
    db.settings.set('onboarding', JSON.stringify({ v: 1, done: ['profile'], skipped: [], at: null, goal: null, startedAt: 'x', completedAt: 'y' }))
    expect(await asUser(needsOnboarding)).toBe(false)
  })

  it('Dashboard leitet ein neues Konto zur Einrichtung um', async () => {
    const { default: DashboardLayout } = await import('@/app/(dashboard)/layout')
    await expect(DashboardLayout({ children: null })).rejects.toThrow('REDIRECT /onboarding')
    expect(nav.redirects).toEqual(['/onboarding'])
  })
})

describe('Prüfungen je Schritt (AC-3)', () => {
  it('Einwilligung nötig, aber nicht erteilt: 400, Zustand unverändert', async () => {
    process.env.REQUIRE_HEALTH_CONSENT = '1'
    const r = await asUser(() => applyOnboarding({ type: 'complete', step: 'consent' }))
    expect(r).toMatchObject({ error: expect.stringContaining('einwilligen') })
    expect(writesTo('onboarding')).toEqual([])
  })

  it('Profil: ohne Angaben 400, überspringen 400; mit Angaben gespeichert (HFmax geschätzt) und weiter', async () => {
    expect(await asUser(() => applyOnboarding({ type: 'complete', step: 'profile' }))).toEqual({ error: 'Profil fehlt.' })
    expect(await asUser(() => applyOnboarding({ type: 'skip', step: 'profile' }))).toMatchObject({ error: expect.stringContaining('nicht überspringen') })
    expect(writesTo('onboarding')).toEqual([])
    const r = await asUser(() => applyOnboarding({ type: 'complete', step: 'profile', profile: PROFILE as never }))
    expect(r).toMatchObject({ state: { done: ['profile'] }, notes: [expect.stringContaining('geschätzt')] })
    const ins = fake.log.find((q) => q.sql.startsWith('insert into "user_profile"'))!
    expect(ins.params).toContain(180)
    expect(stored('athlete_profile')).toMatchObject({ age: 40, weeklyKm: 32, availableDays: [1, 3, 5, 7], longRunDay: 7 })
  })

  it('Datenquelle: „Weiter“ ohne Quelle und ohne Läufe 400; überspringen geht', async () => {
    db.settings.set('onboarding', JSON.stringify({ v: 1, done: ['profile'], skipped: [], at: null, goal: null, startedAt: 'x', completedAt: null }))
    expect(await asUser(() => applyOnboarding({ type: 'complete', step: 'source' }))).toMatchObject({ error: expect.stringContaining('Noch keine Quelle') })
    expect(await asUser(() => applyOnboarding({ type: 'skip', step: 'source' }))).toMatchObject({ state: { skipped: ['source'] } })
  })

  it('Ziel: „fertig“ nur mit einem Plan live; „Erstmal ohne Ziel“ → Grundlage ab nächstem Montag', async () => {
    db.settings.set('onboarding', JSON.stringify({ v: 1, done: ['profile'], skipped: ['source'], at: null, goal: null, startedAt: 'x', completedAt: null }))
    expect(await asUser(() => applyOnboarding({ type: 'complete', step: 'goal' }))).toMatchObject({ error: expect.stringContaining('Noch kein Plan live') })
    const r = await asUser(() => applyOnboarding({ type: 'skip', step: 'goal' }))
    expect(r).toMatchObject({ state: { goal: 'base', skipped: ['source', 'goal'] } })
    const base = stored('base_block')
    expect(base).toMatchObject({ v: 1, paused: false, start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(new Date(`${base.start}T12:00:00Z`).getUTCDay()).toBe(1)
    expect(await asUser(() => applyOnboarding({ type: 'finish' }))).toMatchObject({ state: { completedAt: expect.any(String) } })
  })
})

describe('Grundlage ohne Ziel (AC-5)', () => {
  const profile = { v: 1 as const, age: 40, weightKg: null, heightCm: null, experience: null, weeklyKm: 36, availableDays: [1, 3, 5, 7] as (1 | 3 | 5 | 7)[], longRunDay: 7 as const,
    qualityDays: [3] as 3[], kbDays: [], restDay: 2 as const, maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold' as const, thresholdPaceS: 300, fiveKS: null, savedAt: null }

  it('ohne Start: wie bisher kein Block; mit Start: ab diesem Montag, Umfang aus dem Profil, Schwelle aus dem Profil', () => {
    expect(baseBlocks({ blocks: [], runs: [], today: '2026-11-04', profile, settings: { v: 1, paused: false, capKm: null } })).toEqual([])
    const [b] = baseBlocks({ blocks: [], runs: [], today: '2026-11-04', profile, settings: { v: 1, paused: false, capKm: null, start: '2026-11-09' } })
    expect(b.planStart).toBe('2026-11-09')
    expect(b.base).toBe(true)
    expect(b.weeks[0].km).toBeGreaterThanOrEqual(34)
    expect(b.weeks[0].km).toBeLessThanOrEqual(36)
    expect(b.paces?.threshold).toBe('5:00')
    expect(b.sessions.some((s) => s.key && s.pace === '5:00')).toBe(true)
  })

  it('pausiert: nichts; ein Zielblock danach begrenzt die Grundlage', () => {
    expect(baseBlocks({ blocks: [], runs: [], today: '2026-11-04', profile, settings: { v: 1, paused: true, capKm: null, start: '2026-11-09' } })).toEqual([])
    const goal = { ...NO_BLOCK, id: 'gen-x', goalId: 'x', planStart: '2026-11-23', end: '2027-02-28' }
    const list = baseBlocks({ blocks: [goal], runs: [], today: '2026-11-04', profile, settings: { v: 1, paused: false, capKm: null, start: '2026-11-09' } })
    expect(list.map((b) => [b.planStart, b.end])[0]).toEqual(['2026-11-09', '2026-11-22'])
    // A goal block that starts on or before the base start: the goal-less start does nothing.
    expect(baseBlocks({ blocks: [{ ...goal, planStart: '2026-11-02' }], runs: [], today: '2026-11-04', profile, settings: { v: 1, paused: false, capKm: null, start: '2026-11-09' } })
      .some((b) => b.planStart === '2026-11-09')).toBe(false)
  })
})

// The weight is asked once, in the training profile; the runner profile (carb amounts) takes it over.
describe('Gewicht aus dem Trainingsprofil', () => {
  const ATHLETE: AthleteProfile = {
    v: 1, age: 34, weightKg: 68, heightCm: 178, experience: 'advanced', weeklyKm: 42,
    availableDays: [2, 3, 4, 6, 7], longRunDay: 7, qualityDays: [2, 4], kbDays: [3], restDay: null,
    maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: 265, fiveKS: null, savedAt: null,
  }
  const profileWrites = () => fake.log.filter((q) => q.sql.startsWith('insert into "user_profile"'))

  it('ohne Läuferprofil: das Gewicht wird dort angelegt', async () => {
    const { saveProfile } = await import('@/lib/plan/workshop-store')
    await asUser(() => saveProfile(ATHLETE))
    expect(profileWrites()).toHaveLength(1)
    expect(profileWrites()[0].params).toContain(68)
  })

  it('ohne Gewicht im Trainingsprofil: das Läuferprofil bleibt unberührt', async () => {
    const { saveProfile } = await import('@/lib/plan/workshop-store')
    await asUser(() => saveProfile({ ...ATHLETE, weightKg: null }))
    expect(profileWrites()).toEqual([])
  })
})
