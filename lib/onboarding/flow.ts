// The first-run onboarding (Phase 5) as a pure state machine. Steps in order: the Art. 9 consent (only where it is
// required), the profile, a data source, a goal. Source and goal can be skipped (a skipped goal = "erstmal ohne Ziel",
// a base block); consent and profile cannot. The state is saved after every event (settings 'onboarding'), so the
// flow resumes where it stopped. Which preconditions hold (consent granted, profile saved, …) the server checks before
// it applies an event (lib/onboarding/store.ts).

export const ALL_STEPS = ['consent', 'profile', 'source', 'goal'] as const
export type Step = (typeof ALL_STEPS)[number]
export const SKIPPABLE: readonly Step[] = ['source', 'goal']

export const STEP_LABEL: Record<Step, string> = {
  consent: 'Einwilligung', profile: 'Profil', source: 'Datenquelle', goal: 'Ziel',
}

export interface OnboardingState {
  v: 1
  done: Step[]
  skipped: Step[]
  at: Step | null              // a step opened again with "Zurück"; null = the first open step
  goal: 'race' | 'base' | null // how the goal step ended
  startedAt: string
  completedAt: string | null
  existing?: boolean           // completed without the flow: the account was in use before onboarding existed
}

export type OnboardingEvent =
  | { type: 'complete'; step: Step }
  | { type: 'skip'; step: Step }
  | { type: 'back' }
  | { type: 'finish' }

export const stepsFor = (o: { consentRequired: boolean }): Step[] => ALL_STEPS.filter((s) => s !== 'consent' || o.consentRequired)

export const newState = (at: string): OnboardingState => ({ v: 1, done: [], skipped: [], at: null, goal: null, startedAt: at, completedAt: null })

const settled = (s: OnboardingState, step: Step) => s.done.includes(step) || s.skipped.includes(step)

// The step to show: the one reopened with "Zurück", else the first neither done nor skipped (null = all settled).
export function currentStep(s: OnboardingState, steps: Step[]): Step | null {
  if (s.at && steps.includes(s.at)) return s.at
  return steps.find((x) => !settled(s, x)) ?? null
}

export const allSettled = (s: OnboardingState, steps: Step[]) => steps.every((x) => settled(s, x))
export const isComplete = (s: OnboardingState | null) => !!s?.completedAt

export type Applied = { ok: true; state: OnboardingState } | { ok: false; error: string }

export function apply(s: OnboardingState, e: OnboardingEvent, steps: Step[], at: string): Applied {
  if (s.completedAt) return { ok: false, error: 'Die Einrichtung ist schon abgeschlossen.' }
  const current = currentStep(s, steps)
  switch (e.type) {
    case 'complete':
    case 'skip': {
      if (!steps.includes(e.step)) return { ok: false, error: 'Diesen Schritt gibt es hier nicht.' }
      if (e.step !== current) return { ok: false, error: 'Bitte die Schritte der Reihe nach durchgehen.' }
      if (e.type === 'skip' && !SKIPPABLE.includes(e.step)) return { ok: false, error: `„${STEP_LABEL[e.step]}“ lässt sich nicht überspringen.` }
      const done = e.type === 'complete' ? [...new Set([...s.done, e.step])] : s.done.filter((x) => x !== e.step)
      const skipped = e.type === 'skip' ? [...new Set([...s.skipped, e.step])] : s.skipped.filter((x) => x !== e.step)
      const goal = e.step !== 'goal' ? s.goal : e.type === 'skip' ? 'base' : 'race'
      // After a reopened step, continue with the first one still open (or stay at the end).
      return { ok: true, state: { ...s, done: steps.filter((x) => done.includes(x)), skipped: steps.filter((x) => skipped.includes(x)), at: null, goal } }
    }
    case 'back': {
      const i = current ? steps.indexOf(current) : steps.length
      if (i <= 0) return { ok: false, error: 'Das ist der erste Schritt.' }
      return { ok: true, state: { ...s, at: steps[i - 1] } }
    }
    case 'finish':
      if (!allSettled(s, steps)) return { ok: false, error: 'Es fehlen noch Schritte.' }
      return { ok: true, state: { ...s, at: null, completedAt: at } }
  }
}

// Whatever is stored → a state, or null when unreadable (treated as not started).
export function storedState(raw: unknown): OnboardingState | null {
  const r = raw as Partial<OnboardingState> | null
  if (!r || r.v !== 1 || !Array.isArray(r.done) || !Array.isArray(r.skipped) || typeof r.startedAt !== 'string') return null
  const steps = (a: unknown[]) => a.filter((x): x is Step => (ALL_STEPS as readonly unknown[]).includes(x))
  return {
    v: 1, done: steps(r.done), skipped: steps(r.skipped).filter((x) => SKIPPABLE.includes(x)),
    at: r.at && (ALL_STEPS as readonly string[]).includes(r.at) ? r.at : null,
    goal: r.goal === 'race' || r.goal === 'base' ? r.goal : null,
    startedAt: r.startedAt, completedAt: typeof r.completedAt === 'string' ? r.completedAt : null,
    ...(r.existing ? { existing: true } : {}),
  }
}
