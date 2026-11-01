'use client'

// The browser's user scope (lib/scope.ts): the dashboard layout reads the profile and live blocks on the server and
// passes them in; they become this tab's scope before any page component renders, so client-side plan lookups
// (blocks.ts), zones (hr.ts) and "today" (dates.ts) follow the signed-in runner.
// Client components rendered on the server have no user scope (several users share that process), so the page body
// renders only in the browser: <ScopeReady> shows nothing on the server and during hydration.
import { useSyncExternalStore } from 'react'
import { setProcessScope } from '@/lib/scope'
import type { ResolvedProfile } from '@/lib/profile'
import type { TrainingBlock } from '@/lib/plan/types'

let installed: { userId: string; profile: ResolvedProfile; blocks: TrainingBlock[] } | null = null

export function UserScope({ userId, profile, blocks, children }: { userId: string; profile: ResolvedProfile; blocks: TrainingBlock[]; children: React.ReactNode }) {
  if (typeof window !== 'undefined' && (installed?.userId !== userId || installed.profile !== profile || installed.blocks !== blocks)) {
    setProcessScope(userId, profile, blocks)
    installed = { userId, profile, blocks }
  }
  return <>{children}</>
}

const subscribe = () => () => {}

// True only in the browser after hydration.
export function useScopeReady() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

export function ScopeReady({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return useScopeReady() ? <>{children}</> : <>{fallback}</>
}
