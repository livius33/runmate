// AC-7 (12-04): one constant-time check for the three cron routes, RFC 5545 escaping in the calendar feed, and the GCM
// tag length pinned on decrypt.
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cronAuthorized } from '@/lib/server/cron-auth'
import { esc } from '@/lib/calendar/ics'
import { decrypt, encrypt } from '@/lib/crypto'

const ROOT = join(__dirname, '..', '..')
const req = (auth?: string) => new Request('http://localhost/api/cron/x', { headers: auth ? { authorization: auth } : {} })

describe('Cron-Secret', () => {
  afterEach(() => { delete process.env.CRON_SECRET })

  it('nur genau „Bearer <CRON_SECRET>“; ohne Secret nie', () => {
    expect(cronAuthorized(req('Bearer geheim'), undefined)).toBe(false)
    expect(cronAuthorized(req('Bearer '), '')).toBe(false)
    expect(cronAuthorized(req('Bearer geheim'), 'geheim')).toBe(true)
    for (const a of [undefined, 'Bearer geheim2', 'Bearer gehei', 'bearer geheim', 'geheim']) expect(cronAuthorized(req(a), 'geheim'), String(a)).toBe(false)
    process.env.CRON_SECRET = 'aus-env'
    expect(cronAuthorized(req('Bearer aus-env'))).toBe(true)
  })

  it('alle drei Cron-Routen nutzen diese Prüfung, keine eigene', () => {
    for (const name of ['daily-sync', 'demo-reset', 'expired-accounts']) {
      const src = readFileSync(join(ROOT, 'app/api/cron', name, 'route.ts'), 'utf8')
      expect(src, name).toContain('cronUnauthorized(req)')
      expect(src, name).not.toMatch(/CRON_SECRET|authorization/)
    }
  })

  it('die Routen antworten 401 ohne und laufen mit dem Secret', async () => {
    process.env.CRON_SECRET = 'cron-test'
    const { GET } = await import('@/app/api/cron/demo-reset/route')
    expect((await GET(req('Bearer falsch') as never)).status).toBe(401)
    expect((await GET(req('Bearer cron-test') as never)).status).toBe(404)   // past the check; no demo here
  })
})

describe('ICS-Escaping', () => {
  it('Backslash, Semikolon, Komma; CRLF, CR und LF werden zu \\n', () => {
    expect(esc('a\\b;c,d')).toBe('a\\\\b\\;c\\,d')
    expect(esc('1\r\n2\r3\n4')).toBe('1\\n2\\n3\\n4')
    expect(esc('x;DTSTART:2020\rSUMMARY:y')).not.toMatch(/[\r\n]|[^\\];/)
    expect(esc(null)).toBe('')
  })
})

describe('AES-GCM', () => {
  const KEY = Buffer.alloc(32, 7)

  it('ein verkürzter Tag wird abgelehnt, ein voller entschlüsselt', () => {
    const sealed = encrypt('garmin-session', KEY)
    expect(decrypt(sealed, KEY)).toBe('garmin-session')
    const [v, iv, tag, body] = sealed.split('.')
    const short = [v, iv, Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url'), body].join('.')
    expect(() => decrypt(short, KEY)).toThrow(/could not be decrypted/)
  })
})
