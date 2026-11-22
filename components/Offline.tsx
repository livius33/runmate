'use client'

// Installed app on weak signal (09-01): registers the service worker (production only), knows whether the phone is
// online, shows "Offline – Daten von HH:MM" when pages run on cached data, and turns a write attempted offline into the
// German error the forms already show.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { format } from 'date-fns'
import { WifiOff } from 'lucide-react'

const BUILD = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local'

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true)

let fetchWrapped = false
function refuseOfflineWrites() {
  if (fetchWrapped) return
  fetchWrapped = true
  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'GET' && !navigator.onLine) return Promise.reject(new Error('Offline – nicht gespeichert'))
    return original(input, init)
  }
}

export function OfflineSupport() {
  const online = useOnline()
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  useEffect(() => {
    refuseOfflineWrites()
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register(`/sw.js?v=${BUILD}`).catch(() => {})
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'cached') setCachedAt(e.data.at ?? new Date().toISOString())
      if (e.data?.type === 'fresh') setCachedAt(null)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])
  useEffect(() => { if (online) setCachedAt(null) }, [online])

  if (online && !cachedAt) return null
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-card border border-warning-border bg-warning-soft px-3 py-2 text-body-sm text-warning">
      <WifiOff className="h-4 w-4 shrink-0" />
      {online ? 'Schwaches Netz' : 'Offline'}{cachedAt ? ` – Daten von ${format(new Date(cachedAt), 'HH:mm')}` : ' – zuletzt geladene Daten'}. Ändern geht erst wieder mit Verbindung.
    </div>
  )
}
