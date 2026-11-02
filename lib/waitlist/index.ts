// Waitlist with double opt-in (Phase 6). Pure logic over a repository and a mailer, so tests need no database.
// Answers never reveal whether an address is already on the list: a repeat sign-up looks exactly like a first one.
import { createHash, randomBytes } from 'node:crypto'
import type { Locale } from '@/lib/i18n'

export const WAITLIST = { confirmDays: 7, maxEmail: 254 }
const DAY = 86_400

export interface WaitlistRow { email: string; locale: Locale; tokenHash: string; createdAt: number; confirmedAt: number | null }
export interface WaitlistRepo {
  get(email: string): Promise<WaitlistRow | null>
  byTokenHash(hash: string): Promise<WaitlistRow | null>
  upsert(row: WaitlistRow): Promise<void>
  confirm(email: string, at: number): Promise<void>
  remove(email: string): Promise<void>
  purgeUnconfirmed(createdBefore: number): Promise<void>
}
export interface ConfirmationMail { to: string; locale: Locale; confirmUrl: string; leaveUrl: string }
export interface WaitlistMailer { sendConfirmation(mail: ConfirmationMail): Promise<void> }
export interface WaitlistDeps { repo: WaitlistRepo; mailer: WaitlistMailer; now: number; baseUrl: string }

export type JoinStatus = 'sent' | 'invalid'
export type ConfirmStatus = 'confirmed' | 'expired' | 'invalid'
export type LeaveStatus = 'removed' | 'invalid'

// Trimmed and lower-cased, one @, a dotted domain, no spaces or angle brackets, ≤ 254 characters (RFC 5321).
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.trim().toLowerCase()
  if (!e || e.length > WAITLIST.maxEmail || !EMAIL.test(e)) return null
  const [local, domain] = e.split('@')
  if (local.length > 64 || domain.startsWith('.') || domain.includes('..') || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null
  return e
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export function newToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}
const validToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)

export const asLocale = (v: unknown): Locale => (v === 'en' ? 'en' : 'de')

export async function joinWaitlist(input: { email: unknown; locale: unknown; honeypot?: unknown }, deps: WaitlistDeps): Promise<JoinStatus> {
  const email = normalizeEmail(input.email)
  if (!email) return 'invalid'
  // A filled honeypot is a bot: answer like a success, store nothing.
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) return 'sent'
  await deps.repo.purgeUnconfirmed(deps.now - WAITLIST.confirmDays * DAY)
  const existing = await deps.repo.get(email)
  if (existing?.confirmedAt) return 'sent'
  const locale = asLocale(input.locale)
  const { token, hash } = newToken()
  await deps.repo.upsert({ email, locale, tokenHash: hash, createdAt: deps.now, confirmedAt: null })
  const q = `token=${token}`
  await deps.mailer.sendConfirmation({
    to: email, locale,
    confirmUrl: `${deps.baseUrl}/api/waitlist/confirm?${q}`,
    leaveUrl: `${deps.baseUrl}/api/waitlist/leave?${q}`,
  })
  return 'sent'
}

export async function confirmWaitlist(token: unknown, deps: Pick<WaitlistDeps, 'repo' | 'now'>): Promise<ConfirmStatus> {
  if (!validToken(token)) return 'invalid'
  const row = await deps.repo.byTokenHash(hashToken(token))
  if (!row) return 'invalid'
  if (row.confirmedAt) return 'confirmed'
  if (deps.now - row.createdAt > WAITLIST.confirmDays * DAY) return 'expired'
  await deps.repo.confirm(row.email, deps.now)
  return 'confirmed'
}

export async function leaveWaitlist(token: unknown, deps: Pick<WaitlistDeps, 'repo'>): Promise<LeaveStatus> {
  if (!validToken(token)) return 'invalid'
  const row = await deps.repo.byTokenHash(hashToken(token))
  if (!row) return 'invalid'
  await deps.repo.remove(row.email)
  return 'removed'
}

// Sending is not wired yet: until a mail provider is chosen, the confirmation mail goes nowhere (in development the
// link is printed so the flow can be tested). TODO(Phase 7): implement WaitlistMailer with the chosen provider (EU).
export const pendingMailer: WaitlistMailer = {
  async sendConfirmation(mail) {
    if (process.env.NODE_ENV !== 'production') console.info(`[waitlist] confirmation link (dev only): ${mail.confirmUrl}`)
  },
}

export const statusPath = (locale: Locale, status: string) => (locale === 'en' ? `/en/waitlist/${status}` : `/warteliste/${status}`)
