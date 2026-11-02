'use client'

// Where the app is mounted (Phase 5): '' for the signed-in app, '/demo' for the read-only demo. The navigation uses it
// for its links and its active state, the demo hides what cannot work without writing (sync, settings).
import { createContext, useCallback, useContext } from 'react'
import { usePathname } from 'next/navigation'

export interface AppBase { base: string; readOnly: boolean }
const Ctx = createContext<AppBase>({ base: '', readOnly: false })

export function AppBaseProvider({ value, children }: { value: AppBase; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useAppBase = () => useContext(Ctx)

// The in-app path ('/running', …) without the mount point.
export function useAppPath() {
  const { base } = useAppBase()
  const path = usePathname() ?? '/'
  return base && path.startsWith(base) ? path.slice(base.length) || '/' : path
}

// An in-app href → where it lives under the mount point.
export function useAppHref() {
  const { base } = useAppBase()
  return useCallback((href: string) => (base && href.startsWith('/') ? (href === '/' ? base : `${base}${href}`) : href), [base])
}
