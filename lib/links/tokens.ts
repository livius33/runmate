// Secret links (Phase 2): the calendar feed and the Apple Health upload are called without a login (calendar apps and
// the iOS Shortcut cannot sign in), so the token in the URL says whose they are. One token per user and kind,
// rotatable; a token resolves to exactly one user (link_tokens.token is the primary key).
import { randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { linkTokens } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'

export type LinkKind = 'calendar' | 'health'

// 24 random bytes, base64url: 32 characters.
const TOKEN = /^[A-Za-z0-9_-]{32}$/
export const wellFormedToken = (t: string) => TOKEN.test(t)

export async function getLinkToken(kind: LinkKind): Promise<string | null> {
  const [row] = await db.select({ token: linkTokens.token }).from(linkTokens).where(own(linkTokens, eq(linkTokens.kind, kind))).limit(1)
  return row?.token ?? null
}

// A new token for this user and kind; the old link stops working.
export async function rotateLinkToken(kind: LinkKind): Promise<string> {
  const token = randomBytes(24).toString('base64url')
  const createdAt = Math.floor(Date.now() / 1000)
  await db.insert(linkTokens).values(mine({ token, kind, createdAt }))
    .onConflictDoUpdate({ target: [linkTokens.userId, linkTokens.kind], set: { token, createdAt } })
  return token
}

// Token → user, before any user scope exists. Malformed tokens never reach the database.
export async function userForLinkToken(kind: LinkKind, token: string): Promise<string | null> {
  if (!wellFormedToken(token)) return null
  // cross-user: resolves the owner of a secret link (the only lookup by token)
  const [row] = await db.select({ userId: linkTokens.userId }).from(linkTokens).where(and(eq(linkTokens.token, token), eq(linkTokens.kind, kind))).limit(1)
  return row?.userId ?? null
}
