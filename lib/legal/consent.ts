// Art. 9 GDPR consent for health data (Phase 4), one row per user in `consents` (kind 'health'): version and time of
// the grant, time of a revocation. Required before data comes in on hosted instances; see lib/legal/intake.ts.
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { consents } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { healthConsentRequired } from '@/lib/billing/config'
import { HEALTH_CONSENT_TEXT, HEALTH_CONSENT_VERSION, type HealthConsentStatus } from './consent-text'

const KIND = 'health'
const nowS = () => Math.floor(Date.now() / 1000)

export async function healthConsent(): Promise<HealthConsentStatus> {
  const required = healthConsentRequired()
  const base = { required, current: HEALTH_CONSENT_VERSION, text: HEALTH_CONSENT_TEXT }
  if (!required) return { ...base, granted: true, version: null, grantedAt: null, revokedAt: null }
  const [row] = await db.select().from(consents).where(own(consents, eq(consents.kind, KIND))).limit(1)
  return {
    ...base,
    granted: !!row && row.revokedAt == null && row.version === HEALTH_CONSENT_VERSION,
    version: row?.version ?? null,
    grantedAt: row?.grantedAt ?? null,
    revokedAt: row?.revokedAt ?? null,
  }
}

export async function hasHealthConsent(): Promise<boolean> {
  return (await healthConsent()).granted
}

// Only the current version can be granted (the form sends the version it showed).
export async function grantHealthConsent(version: string): Promise<HealthConsentStatus | { error: string }> {
  if (version !== HEALTH_CONSENT_VERSION) return { error: 'Der Einwilligungstext hat sich geändert. Bitte die Seite neu laden.' }
  const t = nowS()
  await db.insert(consents).values(mine({ kind: KIND, version, grantedAt: t, revokedAt: null }))
    .onConflictDoUpdate({ target: [consents.userId, consents.kind], set: { version, grantedAt: t, revokedAt: null } })
  return healthConsent()
}

// Revoking keeps the row (proof of what was agreed when) and stamps the revocation; intake stops at once.
export async function revokeHealthConsent(): Promise<HealthConsentStatus> {
  await db.update(consents).set({ revokedAt: nowS() }).where(own(consents, and(eq(consents.kind, KIND))))
  return healthConsent()
}
