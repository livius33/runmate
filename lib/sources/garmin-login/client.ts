// The `garmin-connect` client (unofficial, logs in like the Garmin Connect app), narrowed to what the source uses and
// hardened: an MFA prompt becomes GarminMfaError, HTTP errors become GarminHttpError(status) without the library
// logging the response body. Tests replace the factory with a fake (setGarminClientFactory).
import { GarminConnect } from 'garmin-connect'
import { GarminHttpError, GarminMfaError } from './errors'

export interface GarminClient {
  login(username: string, password: string): Promise<unknown>
  loadToken(oauth1: never, oauth2: never): void
  exportToken(): unknown
  getUserProfile(): Promise<unknown>
  getActivities(start: number, limit: number): Promise<unknown[]>
  get<T>(url: string): Promise<T>
}

export type GarminClientFactory = (credentials: { username: string; password: string }) => GarminClient

// A sign-in page without a ticket that asks for a code.
const MFA_PAGE = /verifyMFA|mfa-code|Enter (the )?(MFA|security|verification) code|Sicherheitscode/i

const defaultFactory: GarminClientFactory = (credentials) => {
  const gc = new GarminConnect(credentials)
  const http = gc.client as unknown as { handleMFA(html: string): void; handleHttpError(res: { status: number }): never }
  http.handleMFA = (html: string) => {
    if (!/ticket=/.test(html) && MFA_PAGE.test(String(html))) throw new GarminMfaError()
  }
  http.handleHttpError = (res) => { throw new GarminHttpError(res?.status ?? 0) }
  return gc as unknown as GarminClient
}

// Not per-user state: which implementation builds clients (the real library, or a test fake).
let factory: GarminClientFactory = defaultFactory

export const createGarminClient: GarminClientFactory = (credentials) => factory(credentials)

export function setGarminClientFactory(f: GarminClientFactory | null) {
  factory = f ?? defaultFactory
}
