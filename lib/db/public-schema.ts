// Tables that belong to no user account (Phase 6). Kept apart from schema.ts on purpose: everything there is a user
// table (tests/db/scoping.test.ts) and is exported and deleted with the account (lib/account/data.ts). drizzle-kit reads
// both files (drizzle.config.ts).
import { index, integer, pgTable, text } from 'drizzle-orm/pg-core'

// Waitlist for the hosted version, until sign-up opens. Double opt-in: an entry counts once confirmed_at is set.
// Only the SHA-256 of the confirm token is stored; the same token is the "leave" link afterwards. Unconfirmed entries
// are purged after WAITLIST.confirmDays (lib/waitlist).
export const waitlist = pgTable('waitlist', {
  email: text('email').primaryKey(),              // trimmed, lower case
  locale: text('locale').notNull(),               // 'de' | 'en' (language of the mails)
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at').notNull(),     // last sign-up request; the confirm link counts from here
  confirmedAt: integer('confirmed_at'),
}, (t) => [index('waitlist_token').on(t.tokenHash)])
