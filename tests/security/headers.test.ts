// AC-2 (12-04): security headers on every response, no referrer from the token routes, no X-Powered-By.
import { describe, expect, it } from 'vitest'
import config from '@/next.config'

const rules = await config.headers!()
const byKey = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]))

describe('Sicherheits-Header', () => {
  it('jede Antwort: kein Framing, nosniff, Referrer- und Permissions-Policy', () => {
    const all = rules.find((r) => r.source === '/:path*')!
    expect(byKey(all.headers)).toMatchObject({
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': expect.stringContaining('camera=()'),
    })
  })

  it('Kalender-Feed und Apple-Health-Link: no-referrer, nach der allgemeinen Regel (die spätere gewinnt)', () => {
    const general = rules.findIndex((r) => r.source === '/:path*')
    for (const source of ['/api/calendar/:path*', '/api/health/:path*']) {
      const i = rules.findIndex((r) => r.source === source)
      expect(i, source).toBeGreaterThan(general)
      expect(byKey(rules[i].headers)['Referrer-Policy']).toBe('no-referrer')
    }
  })

  it('kein X-Powered-By', () => {
    expect(config.poweredByHeader).toBe(false)
  })
})
