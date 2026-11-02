'use client'

// The demo tab (Phase 5): the dashboard pages fetch '/api/…' and link to '/running', '/season', …; under /demo those
// become '/demo/api/…' and '/demo/…'. Installed once, before the page bodies render (they render only in the browser,
// components/UserScope.tsx ScopeReady). The demo's own routes answer every write with 403 "Demo – nur ansehen".
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const BASE = '/demo'
let installed = false

const inApp = (href: string) => href.startsWith('/') && !href.startsWith('//') && !href.startsWith(BASE) && !href.startsWith('/api/')

function installFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) return original(`${BASE}${input}`, init)
    if (input instanceof URL && input.origin === window.location.origin && input.pathname.startsWith('/api/')) {
      return original(new URL(`${BASE}${input.pathname}${input.search}`, input.origin), init)
    }
    return original(input, init)
  }
}

export function DemoBridge() {
  installFetch()
  const router = useRouter()
  useEffect(() => {
    // Capture phase on the document runs before Next's <Link> handler, so in-app links stay inside the demo.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      const href = a?.getAttribute('href')
      if (!a || !href || !inApp(href) || a.target === '_blank') return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) { a.setAttribute('href', `${BASE}${href}`); return }
      e.preventDefault()
      e.stopPropagation()
      router.push(href === '/' ? BASE : `${BASE}${href}`)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [router])
  return null
}
