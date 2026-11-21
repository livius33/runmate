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

export async function intakeBlocked(): Promise<Response | null> {
  const blocked = await consentBlocked()
  if (blocked) return blocked
  const e = await currentEntitlements()
  return e.features.sync ? null : featureResponse('sync', e)
}

export async function intakeAllowed(): Promise<boolean> {
  return (await intakeBlocked()) === null
}
