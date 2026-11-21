// May data come in for this user? (Phase 4) Every intake path checks it: source connect, sync and history, file import,
// the Apple Health link and push, the cron. Two conditions: an active plan that includes syncing
// (lib/billing/entitlements.ts, always on for self-host) and, on hosted instances, the Art. 9 health-data consent.
import { NextResponse } from 'next/server'
import { currentEntitlements, featureResponse } from '@/lib/billing/access'
import { hasHealthConsent } from './consent'

export const CONSENT_REQUIRED = 'consent-required'

// The consent alone (12-04): every route that stores health data the user types in (profile heart rate and weight,
// run feedback, RPE, week feedback, the runner questionnaire) calls it when the request carries such data. Reading,
// clearing, export and deletion never need it. Always null when consent is not required (self-host).
export async function consentBlocked(carriesHealthData = true): Promise<Response | null> {
  if (!carriesHealthData || (await hasHealthConsent())) return null
  return NextResponse.json({
    error: 'Bitte zuerst in den Einstellungen unter „Gesundheitsdaten“ in die Verarbeitung deiner Gesundheitsdaten einwilligen.',
    code: CONSENT_REQUIRED,
  }, { status: 403 })
}

// A value that would be stored (null clears a field, undefined leaves it).
export const given = (v: unknown) => v !== undefined && v !== null

// Does a save bring in health data that is not stored yet? A new or changed value under one of `keys` does; a value
// that is already stored (a whole-object save sending it back) and clearing do not.
export function newHealthData(next: Record<string, unknown>, stored: Record<string, unknown> | null | undefined, keys: Iterable<string>): boolean {
  for (const k of keys) {
    if (given(next[k]) && JSON.stringify(next[k]) !== JSON.stringify(stored?.[k] ?? null)) return true
  }
  return false
}

export async function intakeBlocked(): Promise<Response | null> {
  const blocked = await consentBlocked()
  if (blocked) return blocked
  const e = await currentEntitlements()
  return e.features.sync ? null : featureResponse('sync', e)
}

export async function intakeAllowed(): Promise<boolean> {
  return (await intakeBlocked()) === null
}
