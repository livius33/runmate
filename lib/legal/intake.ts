// May data come in for this user? (Phase 4) Every intake path checks it: source connect, sync and history, file import,
// the Apple Health link and push, the cron. Two conditions: an active plan that includes syncing
// (lib/billing/entitlements.ts, always on for self-host) and, on hosted instances, the Art. 9 health-data consent.
import { NextResponse } from 'next/server'
import { currentEntitlements, featureResponse } from '@/lib/billing/access'
import { hasHealthConsent } from './consent'

export const CONSENT_REQUIRED = 'consent-required'

export async function intakeBlocked(): Promise<Response | null> {
  if (!(await hasHealthConsent())) {
    return NextResponse.json({
      error: 'Bitte zuerst in den Einstellungen unter „Gesundheitsdaten“ in die Verarbeitung deiner Gesundheitsdaten einwilligen.',
      code: CONSENT_REQUIRED,
    }, { status: 403 })
  }
  const e = await currentEntitlements()
  return e.features.sync ? null : featureResponse('sync', e)
}

export async function intakeAllowed(): Promise<boolean> {
  return (await intakeBlocked()) === null
}
