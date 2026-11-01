// What went wrong with the Garmin login, as a code and a German message for Settings. The library's own messages and
// errors can carry request details (headers, form data), so they are only inspected here and never passed on. Pure.
import { SourceError, type SourceErrorCode } from '@/lib/sources/types'

export const GARMIN_MESSAGES: Record<SourceErrorCode, string> = {
  'not-connected': 'Kein Garmin-Konto verbunden (Einstellungen → Datenquellen).',
  auth: 'Garmin hat die Anmeldung abgelehnt: E-Mail oder Passwort stimmen nicht.',
  mfa: 'Dein Garmin-Konto verlangt einen Bestätigungscode (Zwei-Faktor-Anmeldung). Den kann die Garmin-Anmeldung in Runmate noch nicht eingeben – bis dahin bitte den Datei-Import nutzen.',
  locked: 'Garmin verlangt eine Aktion in deinem Konto (z. B. gesperrt nach zu vielen Versuchen oder Telefonnummer bestätigen). Melde dich einmal auf connect.garmin.com an und versuche es dann erneut.',
  'rate-limited': 'Garmin bremst gerade zu viele Anfragen. Bitte in ein paar Stunden erneut versuchen.',
  'login-changed': 'Garmin hat seine Anmeldung geändert, der inoffizielle Zugang funktioniert gerade nicht. Bis zu einem Update hilft der Datei-Import.',
  unavailable: 'Garmin Connect ist gerade nicht erreichbar. Bitte später erneut versuchen.',
  invalid: 'E-Mail und Passwort von Garmin Connect angeben und der Einwilligung zustimmen.',
  unknown: 'Garmin-Synchronisierung fehlgeschlagen. Bitte später erneut versuchen.',
}

export const garminError = (code: SourceErrorCode) => new SourceError(code, GARMIN_MESSAGES[code])

// Thrown by the hardened client (client.ts) instead of the library's message with the full response body.
export class GarminHttpError extends Error {
  constructor(readonly status: number) {
    super(`Garmin HTTP ${status}`)
    this.name = 'GarminHttpError'
  }
}
// Thrown by the client's MFA hook when the sign-in page asks for a code.
export class GarminMfaError extends Error {
  constructor() {
    super('Garmin MFA required')
    this.name = 'GarminMfaError'
  }
}

const statusOf = (err: any): number | null => {
  if (err instanceof GarminHttpError) return err.status
  const s = err?.response?.status ?? err?.status
  return typeof s === 'number' ? s : null
}

export function classifyGarminError(err: unknown, phase: 'login' | 'request' = 'request'): SourceError {
  if (err instanceof SourceError) return err
  if (err instanceof GarminMfaError) return garminError('mfa')
  const msg = String((err as any)?.message ?? '')
  const status = statusOf(err)
  if (status === 429 || /too many requests/i.test(msg)) return garminError('rate-limited')
  if (/AccountLocked|Update Phone number/i.test(msg)) return garminError('locked')
  if (/Ticket not found/i.test(msg)) return garminError('auth')
  if (/csrf not found|No OAUTH_CONSUMER|No Oauth2Token|Oauth1Token/i.test(msg)) return garminError('login-changed')
  if (status === 401) return garminError('auth')
  // A 403 or 404 while signing in: Garmin blocks or moved the SSO pages.
  if (phase === 'login' && (status === 403 || status === 404)) return garminError('login-changed')
  if ((status != null && status >= 500) || /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(msg)) return garminError('unavailable')
  return garminError('unknown')
}
