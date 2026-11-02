// Server side of lib/scope.ts: one AsyncLocalStorage store per request, entered by runAsUser(). Importing this module
// installs the resolver, so every server entry point that runs as a user imports it (directly or via withUser).
// Node only (async_hooks): a client bundle importing it fails the build.
import { AsyncLocalStorage } from 'node:async_hooks'
import { NextResponse } from 'next/server'
import { UnauthorizedError, createScope, installScopeResolver, type Scope, type ScopeFlags } from '@/lib/scope'
import type { ResolvedProfile, UserProfile } from '@/lib/profile'

const als = new AsyncLocalStorage<Scope>()
installScopeResolver(() => als.getStore())

export interface RunAsOptions extends ScopeFlags {
  profile?: Partial<UserProfile> | ResolvedProfile | null   // skip loading it (tests, or already loaded)
}

// Run `fn` as this user: their profile, their blocks, their rows. Scopes never nest into each other: a nested call
// for another user gets its own store. Read-only is sticky (Phase 5 demo): nothing run inside a read-only scope can
// open a writable one.
export async function runAsUser<T>(userId: string, fn: () => Promise<T>, opts: RunAsOptions = {}): Promise<T> {
  if (!userId) throw new UnauthorizedError()
  const outer = als.getStore()
  const profile = opts.profile !== undefined ? opts.profile : await (await import('@/lib/profile-store')).loadUserProfile(userId)
  return als.run(createScope(userId, profile, [], { readOnly: opts.readOnly || !!outer?.readOnly, demo: opts.demo }), fn)
}

// The Clerk user of this request (or of the scope already entered); throws UnauthorizedError without a session.
export async function getUserId(): Promise<string> {
  const inScope = als.getStore()?.userId
  if (inScope) return inScope
  const { auth } = await import('@clerk/nextjs/server')
  const { userId } = await auth()
  if (!userId) throw new UnauthorizedError()
  return userId
}

// Route handler wrapper: 401 without a session, otherwise the handler runs as the signed-in user.
export function withUser<A extends unknown[]>(handler: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    let userId: string
    try {
      userId = await getUserId()
    } catch (err) {
      if (err instanceof UnauthorizedError) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
      throw err
    }
    // Already running as this user (the demo's dispatcher, lib/demo/serve.ts): keep that scope and its flags.
    if (als.getStore()?.userId === userId) return handler(...args)
    return runAsUser(userId, async () => handler(...args))
  }
}
