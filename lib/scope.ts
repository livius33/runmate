// Whose request this is (Phase 2): the user, their profile and their live training blocks, plus a cache for the request.
// Everything that used to be module state (block registry, zones, athlete facts, "today") reads currentScope(), so
// lookups stay synchronous and two users served by the same process never see each other's data.
//
// - Server: lib/server/scope.ts installs an AsyncLocalStorage resolver; route handlers, the dashboard layout, the cron
//   job and the token routes run inside runAsUser(). Outside a user scope the server sees only the process scope
//   (plan files, default profile), and writing per-user state into it throws.
// - Browser: one user per tab; components/UserScope.tsx fills the process scope from what the layout read.
// - Scripts and tests: the process scope, set with setProcessScope().
// Isomorphic: no Node imports here.
import type { TrainingBlock } from '@/lib/plan/types'
import { DEFAULT_RESOLVED, resolveProfile, type ResolvedProfile, type UserProfile } from '@/lib/profile'

export interface Scope {
  readonly userId: string | null
  profile: ResolvedProfile
  live: TrainingBlock[]                  // live blocks as last registered (lib/plan/blocks.ts accepts them)
  registry: TrainingBlock[] | null       // memo of blocks.ts: built-ins + accepted live blocks
  registryVersion: number
  readonly cache: Map<string, unknown>   // per request (e.g. the Garmin client of this user)
  // Phase 5 demo (lib/demo/): the database refuses every write in a read-only scope (lib/db/index.ts), and the demo
  // gets every feature without reading billing (lib/billing/access.ts).
  readonly readOnly: boolean
  readonly demo: boolean
}

export interface ScopeFlags { readOnly?: boolean; demo?: boolean }

export function createScope(userId: string | null, profile: Partial<UserProfile> | ResolvedProfile | null = null, live: TrainingBlock[] = [], flags: ScopeFlags = {}): Scope {
  return {
    userId,
    profile: profile && 'defaults' in profile ? profile as ResolvedProfile : resolveProfile(profile),
    live, registry: null, registryVersion: -1, cache: new Map(),
    readOnly: !!flags.readOnly, demo: !!flags.demo,
  }
}

let resolver: () => Scope | undefined = () => undefined
let processScope = createScope(null, DEFAULT_RESOLVED)

// Called once by lib/server/scope.ts.
export function installScopeResolver(fn: () => Scope | undefined) {
  resolver = fn
}

export function currentScope(): Scope {
  return resolver() ?? processScope
}

// A Next.js server outside any user scope (e.g. client components rendered on the server): per-user state must
// never be written there, because the next request of another user would read it.
function sharedServerProcess() {
  return typeof window === 'undefined' && typeof process !== 'undefined' && !!process.env?.NEXT_RUNTIME && resolver() === undefined
}

// The scope per-user state may be written to.
export function writableScope(): Scope {
  if (sharedServerProcess()) throw new Error('Per-user state written outside a user scope on the server (wrap the caller in runAsUser/withUser)')
  return currentScope()
}

// Browser tab, script or test: replace the process scope (the browser's UserScope provider, tests/setup.ts).
export function setProcessScope(userId: string | null, profile: Partial<UserProfile> | ResolvedProfile | null, live: TrainingBlock[] = []) {
  if (sharedServerProcess()) throw new Error('setProcessScope on the server')
  processScope = createScope(userId, profile, live)
  return processScope
}

// The user of this scope; throws outside one (every DB helper goes through this, lib/db/owned.ts).
export function scopeUserId(): string {
  const id = currentScope().userId
  if (!id) throw new UnauthorizedError()
  return id
}

export class UnauthorizedError extends Error {
  readonly status = 401
  constructor() { super('Not signed in') }
}

// Signed in, but not on ALLOWED_EMAILS (lib/server/allowlist.ts).
export class NotAllowedError extends Error {
  readonly status = 403
  constructor() { super('Not on the allowlist') }
}

// A write attempted in a read-only scope (the demo): the demo routes answer it with 403.
export class ReadOnlyError extends Error {
  readonly status = 403
  constructor() { super('Demo – nur ansehen') }
}
