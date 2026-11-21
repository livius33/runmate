// 12-04 follow-up: a cooldown is not a failure. The header sync shows a 429 neutrally with the server's message, and the
// export link answers a cooldown with readable German text instead of JSON.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncCooldown, syncError } from '@/components/HeaderSync'
import { useFakeDb } from '../scope/fake-db'

vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: 'user-e' }) }))
vi.mock('@/lib/account/data', () => ({ exportUserData: async () => new Uint8Array([1]) }))
const stored = vi.hoisted(() => ({ value: null as string | null }))
const fake = useFakeDb((q) => {
  if (/^insert into "settings"/.test(q.sql)) { stored.value = String(q.params[2]); return [] }
  if (/^select .* from "settings"/.test(q.sql) && stored.value) return [[stored.value]]
  return []
})
afterAll(() => fake.restore())
beforeEach(() => { stored.value = null })

describe('Sync im Header', () => {
  it('429: Abkühlzeit mit der Meldung des Servers, kein Fehler', () => {
    const e = syncError(429, { error: 'Zu viele Anfragen. Bitte in 45 Sekunden erneut versuchen.' })
    expect(e).toBeInstanceOf(SyncCooldown)
    expect(e.message).toBe('Zu viele Anfragen. Bitte in 45 Sekunden erneut versuchen.')
  })

  it('andere Fehler bleiben Fehler', () => {
    const e = syncError(503, { error: 'Garmin ist nicht erreichbar' })
    expect(e).not.toBeInstanceOf(SyncCooldown)
    expect(e.message).toBe('Garmin ist nicht erreichbar')
    expect(syncError(500, null).message).toBe('Synchronisierung fehlgeschlagen')
  })
})

describe('Export-Link', () => {
  it('zweiter Export gleich danach: 429 mit Retry-After als lesbarer Text', async () => {
    const { GET } = await import('@/app/api/account/export/route')
    expect((await GET()).status).toBe(200)
    const res = await GET()
    expect(res.status).toBe(429)
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(await res.text()).toMatch(/^Der Export wurde gerade erst erstellt\. Bitte in \d+ (Sekunden|Minuten) erneut versuchen\.$/)
  })
})
