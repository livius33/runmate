// AC-8 (Phase 6): waitlist validation and double opt-in, over an in-memory repository and a recording mailer.
import { describe, expect, it } from 'vitest'
import {
  confirmWaitlist, hashToken, joinWaitlist, leaveWaitlist, normalizeEmail, WAITLIST,
  type ConfirmationMail, type WaitlistRepo, type WaitlistRow,
} from '@/lib/waitlist'

function memory() {
  const rows = new Map<string, WaitlistRow>()
  const writes: string[] = []
  const repo: WaitlistRepo = {
    async get(e) { return rows.get(e) ?? null },
    async byTokenHash(h) { return [...rows.values()].find((r) => r.tokenHash === h) ?? null },
    async upsert(r) { writes.push(`upsert ${r.email}`); rows.set(r.email, { ...r }) },
    async confirm(e, at) { writes.push(`confirm ${e}`); rows.get(e)!.confirmedAt = at },
    async remove(e) { writes.push(`remove ${e}`); rows.delete(e) },
    async purgeUnconfirmed(before) { for (const [e, r] of rows) if (!r.confirmedAt && r.createdAt < before) rows.delete(e) },
  }
  const mails: ConfirmationMail[] = []
  const mailer = { async sendConfirmation(m: ConfirmationMail) { mails.push(m) } }
  return { rows, writes, repo, mails, mailer }
}
const NOW = 1_800_000_000
const DAY = 86_400
const tokenOf = (m: ConfirmationMail) => new URL(m.confirmUrl).searchParams.get('token')!

describe('E-Mail-Prüfung', () => {
  it('normalisiert und akzeptiert übliche Adressen', () => {
    expect(normalizeEmail('  Läufer.Name+porto@Example.DE ')).toBe('läufer.name+porto@example.de')
    expect(normalizeEmail('a@b.co')).toBe('a@b.co')
  })
  it('lehnt Kaputtes ab', () => {
    for (const bad of ['', 'abc', 'a@b', 'a@b.c', 'a b@c.de', 'a@@b.de', '<a@b.de>', 'a@b..de', '.a@b.de', 'a.@b.de', 'a..b@c.de', `${'x'.repeat(65)}@b.de`, `a@${'b'.repeat(250)}.de`, 42, null, undefined]) {
      expect(normalizeEmail(bad), String(bad)).toBeNull()
    }
    expect(WAITLIST.maxEmail).toBe(254)
  })
})

describe('Double-Opt-in', () => {
  const deps = (m: ReturnType<typeof memory>, now = NOW) => ({ repo: m.repo, mailer: m.mailer, now, baseUrl: 'https://runmate.test' })

  it('Eintragen: nur der Hash des Tokens wird gespeichert, die Mail trägt den Token', async () => {
    const m = memory()
    expect(await joinWaitlist({ email: 'Neu@Example.de', locale: 'en' }, deps(m))).toBe('sent')
    const row = m.rows.get('neu@example.de')!
    expect(row).toMatchObject({ locale: 'en', createdAt: NOW, confirmedAt: null })
    expect(m.mails).toHaveLength(1)
    const token = tokenOf(m.mails[0])
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(row.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(m.mails[0].confirmUrl.startsWith('https://runmate.test/api/waitlist/confirm?token=')).toBe(true)
    expect(m.mails[0].leaveUrl).toBe(`https://runmate.test/api/waitlist/leave?token=${token}`)
  })

  it('ungültige Adresse: nichts gespeichert, keine Mail', async () => {
    const m = memory()
    expect(await joinWaitlist({ email: 'kaputt', locale: 'de' }, deps(m))).toBe('invalid')
    expect(m.writes).toEqual([])
    expect(m.mails).toEqual([])
  })

  it('Honeypot gefüllt: Antwort wie Erfolg, nichts gespeichert', async () => {
    const m = memory()
    expect(await joinWaitlist({ email: 'bot@example.de', locale: 'de', honeypot: 'https://spam' }, deps(m))).toBe('sent')
    expect(m.writes).toEqual([])
    expect(m.mails).toEqual([])
  })

  it('bestätigen: einmal wirksam, danach unverändert; der alte Token gilt nach erneutem Eintragen nicht mehr', async () => {
    const m = memory()
    await joinWaitlist({ email: 'a@example.de', locale: 'de' }, deps(m))
    const first = tokenOf(m.mails[0])
    await joinWaitlist({ email: 'a@example.de', locale: 'de' }, deps(m, NOW + 60))
    const second = tokenOf(m.mails[1])
    expect(await confirmWaitlist(first, { repo: m.repo, now: NOW + 120 })).toBe('invalid')
    expect(await confirmWaitlist(second, { repo: m.repo, now: NOW + 120 })).toBe('confirmed')
    expect(m.rows.get('a@example.de')!.confirmedAt).toBe(NOW + 120)
    expect(await confirmWaitlist(second, { repo: m.repo, now: NOW + 999 })).toBe('confirmed')
    expect(m.rows.get('a@example.de')!.confirmedAt).toBe(NOW + 120)
    expect(m.writes.filter((w) => w.startsWith('confirm'))).toHaveLength(1)
  })

  it('schon bestätigt: erneutes Eintragen verrät nichts, schreibt nichts, schickt keine Mail', async () => {
    const m = memory()
    await joinWaitlist({ email: 'a@example.de', locale: 'de' }, deps(m))
    await confirmWaitlist(tokenOf(m.mails[0]), { repo: m.repo, now: NOW + 10 })
    const before = m.writes.length
    expect(await joinWaitlist({ email: 'A@example.de', locale: 'de' }, deps(m, NOW + 20))).toBe('sent')
    expect(m.writes.length).toBe(before)
    expect(m.mails).toHaveLength(1)
  })

  it(`Link läuft nach ${WAITLIST.confirmDays} Tagen ab; unbestätigte Einträge werden danach gelöscht`, async () => {
    const m = memory()
    await joinWaitlist({ email: 'spaet@example.de', locale: 'de' }, deps(m))
    const token = tokenOf(m.mails[0])
    expect(await confirmWaitlist(token, { repo: m.repo, now: NOW + 7 * DAY + 1 })).toBe('expired')
    expect(m.rows.get('spaet@example.de')!.confirmedAt).toBeNull()
    await joinWaitlist({ email: 'other@example.de', locale: 'de' }, deps(m, NOW + 8 * DAY))
    expect(m.rows.has('spaet@example.de')).toBe(false)
  })

  it('falsche oder fehlende Tokens', async () => {
    const m = memory()
    for (const t of [null, '', 'x', 'a'.repeat(43), '../etc', 12]) expect(await confirmWaitlist(t, { repo: m.repo, now: NOW })).toBe('invalid')
    expect(await leaveWaitlist('a'.repeat(43), { repo: m.repo })).toBe('invalid')
  })

  it('austragen löscht den Eintrag (auch bestätigt)', async () => {
    const m = memory()
    await joinWaitlist({ email: 'weg@example.de', locale: 'de' }, deps(m))
    const token = tokenOf(m.mails[0])
    await confirmWaitlist(token, { repo: m.repo, now: NOW + 5 })
    expect(await leaveWaitlist(token, { repo: m.repo })).toBe('removed')
    expect(m.rows.size).toBe(0)
    expect(await leaveWaitlist(token, { repo: m.repo })).toBe('invalid')
  })
})

describe('Routen ohne Datenbank', () => {
  it('Formular → 303 auf die statische Fehlerseite der Sprache; Bestätigen und Austragen ebenso', async () => {
    const saved = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const { POST } = await import('@/app/api/waitlist/route')
      const body = new URLSearchParams({ email: 'a@example.de', locale: 'en' })
      const res = await POST(new Request('https://runmate.test/api/waitlist', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } }))
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe('https://runmate.test/en/waitlist/error')
      const confirm = await (await import('@/app/api/waitlist/confirm/route')).GET(new Request('https://runmate.test/api/waitlist/confirm?token=x'))
      expect(confirm.headers.get('location')).toBe('https://runmate.test/warteliste/error')
      const leave = await (await import('@/app/api/waitlist/leave/route')).GET(new Request('https://runmate.test/api/waitlist/leave?token=x'))
      expect(leave.headers.get('location')).toBe('https://runmate.test/warteliste/error')
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved
    }
  })
})
