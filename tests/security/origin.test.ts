// 12-04 task 3: with APP_HOST set, Clerk's authorizedParties is pinned and state-changing requests from another site
// are refused by the middleware; without it (self-host, keyless dev) nothing changes.
import { describe, expect, it } from 'vitest'
import { authorizedParties, foreignOrigin } from '@/lib/server/origin'

const req = (method: string, origin?: string, url = 'https://runmate.dev/api/profile', extra: Record<string, string> = {}) =>
  new Request(url, { method, headers: { ...(origin ? { origin } : {}), ...extra } })

describe('authorizedParties', () => {
  it('ohne APP_HOST: nicht gesetzt', () => {
    expect(authorizedParties('http://localhost:3000', undefined)).toBeUndefined()
    expect(authorizedParties('http://localhost:3000', ' ')).toBeUndefined()
  })

  it('mit APP_HOST: der öffentliche Host und der Host dieser Anfrage', () => {
    expect(authorizedParties('https://runmate.dev', 'runmate.dev')).toEqual(['https://runmate.dev'])
    expect(authorizedParties('https://runmate-git-x.vercel.app', 'runmate.dev')).toEqual(['https://runmate.dev', 'https://runmate-git-x.vercel.app'])
  })
})

describe('foreignOrigin', () => {
  const HOST = 'runmate.dev'

  it('ohne APP_HOST: nie', () => {
    expect(foreignOrigin(req('POST', 'https://evil.example'), undefined)).toBe(false)
  })

  it('fremde Herkunft bei POST/PUT/PATCH/DELETE: abgelehnt', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(foreignOrigin(req(m, 'https://evil.example'), HOST), m).toBe(true)
    expect(foreignOrigin(req('POST', 'https://evil.runmate.dev'), HOST)).toBe(true)
    expect(foreignOrigin(req('POST', 'null'), HOST)).toBe(true)
  })

  it('eigene Herkunft, kein Origin oder lesende Anfrage: durch', () => {
    expect(foreignOrigin(req('POST', 'https://runmate.dev'), HOST)).toBe(false)
    expect(foreignOrigin(req('POST', 'https://RUNMATE.dev'), HOST)).toBe(false)
    expect(foreignOrigin(req('POST'), HOST)).toBe(false)
    expect(foreignOrigin(req('GET', 'https://evil.example'), HOST)).toBe(false)
    // A preview deployment posting to itself, and a proxy naming the public host.
    expect(foreignOrigin(req('POST', 'https://pr-1.vercel.app', 'https://pr-1.vercel.app/api/x'), HOST)).toBe(false)
    expect(foreignOrigin(req('POST', 'https://app.example', 'http://localhost:3000/api/x', { 'x-forwarded-host': 'app.example' }), HOST)).toBe(false)
  })
})
