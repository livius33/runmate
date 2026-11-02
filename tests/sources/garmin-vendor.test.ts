// Phase 3 follow-up: the vendored garmin-connect client (lib/vendor/garmin-connect/) never lets a token or a credential
// reach the console. The HTTP layer is a mocked axios adapter: a request with an expired session gets a 401, the
// token refresh then fails with an error whose message, config and response all carry secrets.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { createGarminClient, setGarminClientFactory } from '@/lib/sources/garmin-login/client'
import { classifyGarminError } from '@/lib/sources/garmin-login/errors'
import { GarminConnect, GarminConnectError, type IOauth1Token, type IOauth2Token } from '@/lib/vendor/garmin-connect'
import { scrub } from '@/lib/vendor/garmin-connect/redact'

const EMAIL = 'runner@example.com', PASSWORD = 'hunter2-secret'
const OAUTH1: IOauth1Token = { oauth_token: 'oauth1-token-value', oauth_token_secret: 'oauth1-secret-value' }
const OAUTH2 = { access_token: 'oauth2-access-value', refresh_token: 'oauth2-refresh-value', jti: 'jti-value', expires_in: 3600, refresh_token_expires_in: 7200 } as IOauth2Token
const CONSUMER = { consumer_key: 'consumer-key-value', consumer_secret: 'consumer-secret-value' }
const SECRETS = [EMAIL, PASSWORD, OAUTH1.oauth_token, OAUTH1.oauth_token_secret, OAUTH2.access_token, OAUTH2.refresh_token, CONSUMER.consumer_key, CONSUMER.consumer_secret]

let logs: string[]
const original = axios.defaults.adapter
const calls: string[] = []

// Every console method, captured the way Node would print it (objects inspected, errors with their stack).
beforeEach(() => {
  logs = []
  calls.length = 0
  for (const m of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
      logs.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack} ${JSON.stringify(x)}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
    })
  }
})
afterEach(() => { axios.defaults.adapter = original; vi.restoreAllMocks(); setGarminClientFactory(null) })

const fail = (config: InternalAxiosRequestConfig, status: number | null, message: string) => {
  const response = status == null ? undefined : { status, statusText: 'x', headers: {}, config, data: { echo: `${config.headers.Authorization}`, email: EMAIL } }
  return new AxiosError(message, status == null ? 'ECONNRESET' : 'ERR_BAD_REQUEST', config, {}, response as never)
}

// Activity list → 401 (expired session); consumer → ok; OAuth exchange (the refresh) → `refresh`.
function mockHttp(refresh: 'network' | 500) {
  const adapter: AxiosAdapter = async (config) => {
    const url = String(config.url)
    calls.push(url.split('?')[0])
    if (url.includes('oauth_consumer.json')) return { status: 200, statusText: 'OK', headers: {}, config, data: CONSUMER }
    if (url.includes('/exchange/user/2.0')) {
      config.headers = new AxiosHeaders({ ...config.headers, Authorization: `Bearer ${OAUTH2.access_token}` })
      throw refresh === 'network'
        ? fail(config, null, `connect ECONNRESET while posting ${url} (Bearer ${OAUTH2.access_token}, password=${PASSWORD}) ${OAUTH2.refresh_token}`)
        : fail(config, 500, 'Request failed with status code 500')
    }
    throw fail(config, 401, 'Request failed with status code 401')
  }
  axios.defaults.adapter = adapter
}

const sessionClient = () => {
  const gc = createGarminClient({ username: EMAIL, password: PASSWORD })
  gc.loadToken(structuredClone(OAUTH1) as never, structuredClone(OAUTH2) as never)
  return gc
}
const noSecrets = (text: string) => { for (const s of SECRETS) expect(text).not.toContain(s) }

describe('Vendored garmin-connect: Token-Refresh-Fehler', () => {
  it('Netzwerkfehler beim Refresh: eine bereinigte Logzeile, bereinigter Fehler, keine Geheimnisse', async () => {
    mockHttp('network')
    const err = await sessionClient().getActivities(0, 1).catch((e) => e)
    expect(calls).toEqual([
      'https://connectapi.garmin.com/activitylist-service/activities/search/activities',
      'https://thegarth.s3.amazonaws.com/oauth_consumer.json',
      'https://connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0',
    ])
    expect(err).toBeInstanceOf(GarminConnectError)
    expect(Object.keys(err)).not.toContain('config')
    expect(err.message).toContain('ECONNRESET')
    noSecrets(`${err.message} ${err.stack} ${JSON.stringify(err)}`)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatch(/^\[garmin-connect\] token refresh failed: connect ECONNRESET/)
    noSecrets(logs.join('\n'))
    expect(classifyGarminError(err).code).toBe('unavailable')
  })

  it('HTTP 500 beim Refresh; wartende Anfragen scheitern mit, danach hängt nichts', async () => {
    mockHttp(500)
    const gc = sessionClient()
    const [a, b] = await Promise.all([gc.getActivities(0, 1).catch((e) => e), gc.getUserProfile().catch((e) => e)])
    for (const e of [a, b]) noSecrets(`${e.message} ${e.stack} ${JSON.stringify(e)}`)
    expect(classifyGarminError(a).code).toBe('unavailable')
    // With the session loaded again, a later request refreshes again instead of waiting forever (upstream kept
    // `isRefreshing` set after a failed refresh).
    gc.loadToken(structuredClone(OAUTH1) as never, structuredClone(OAUTH2) as never)
    const c = await gc.getActivities(0, 1).catch((e) => e)
    expect(c).toBeInstanceOf(Error)
    expect(calls.filter((u) => u.includes('/exchange/')).length).toBeGreaterThanOrEqual(2)
    noSecrets(logs.join('\n'))
  })

  it('Refresh-Zustand je Client: der Refresh eines Nutzers blockiert den anderen nicht', async () => {
    mockHttp('network')
    const [one, two] = [sessionClient(), new GarminConnect({ username: 'other@example.com', password: 'other-pass' })]
    two.loadToken(structuredClone(OAUTH1), structuredClone(OAUTH2))
    const r = await Promise.all([one.getActivities(0, 1).catch((e) => e), two.getActivities(0, 1).catch((e) => e)])
    // Each client ran its own refresh (upstream: the second would have waited on the first's module-level flag).
    expect(calls.filter((u) => u.includes('/exchange/'))).toHaveLength(2)
    for (const e of r) expect(e).toBeInstanceOf(GarminConnectError)
    noSecrets(logs.join('\n'))
  })

  it('scrub: Header- und Query-Formen werden geschwärzt', () => {
    const t = scrub('Authorization: Bearer abc.def OAuth oauth_token="t1", oauth_signature="s%2F" ?oauth_token=t2&access_token=t3 {"refresh_token":"t4"}', ['hunter2-secret'])
    for (const s of ['abc.def', 't1', 's%2F', 't2', 't3', 't4']) expect(t).not.toContain(s)
    expect(scrub('login failed (Ticket not found or MFA)')).toBe('login failed (Ticket not found or MFA)')
    expect(scrub('pw hunter2-secret here', ['hunter2-secret'])).toBe('pw [redacted] here')
  })
})
