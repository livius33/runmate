// Row ownership (Phase 2): every query on a user table goes through these, so it only ever sees the rows of the user
// whose scope this is (lib/scope.ts). tests/db/scoping.test.ts fails on queries that bypass them.
import { and, eq, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { scopeUserId } from '@/lib/scope'

// The current user's id; throws (401) outside a user scope.
export const uid = scopeUserId

// WHERE user_id = <current user> AND …the other conditions.
export function own(table: { userId: PgColumn }, ...where: (SQL | undefined)[]): SQL {
  return and(eq(table.userId, uid()), ...where)!
}

// Insert values stamped with the current user.
export function mine<T extends object>(values: T): T & { userId: string } {
  return { ...values, userId: uid() }
}
