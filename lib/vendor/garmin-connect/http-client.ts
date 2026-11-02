// SPDX-License-Identifier: MIT
// Vendored from garmin-connect 1.6.2 (Copyright (c) 2020 Oskar Bernberg, MIT: see LICENSE in this folder), file
// src/common/HttpClient.ts, ported from the published build to TypeScript and reduced to what Runmate's Garmin source
// uses (login, token export/import and refresh, GET). Runmate changes are marked "Runmate:"; README.md lists them.
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import FormData from 'form-data'
import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import type { UrlClass } from './urls'
import { logSafe, safeError } from './redact'

export interface IOauth1Token { oauth_token: string; oauth_token_secret: string }
export interface IOauth2Token {
  scope: string
  jti: string
  access_token: string
  token_type: string
  refresh_token: string
  expires_in: number
  refresh_token_expires_in: number
  expires_at: number
  refresh_token_expires_at: number
  last_update_date: string
  expires_date: string
}
interface IOauth1 { token: IOauth1Token; oauth: OAuth }
interface IOauth1Consumer { key: string; secret: string }

const CSRF_RE = new RegExp('name="_csrf"\\s+value="(.+?)"')
const TICKET_RE = new RegExp('ticket=([^"]+)"')
const ACCOUNT_LOCKED_RE = new RegExp('var statuss*=s*"([^"]*)"')
const PAGE_TITLE_RE = new RegExp('<title>([^<]*)</title>')

const USER_AGENT_CONNECTMOBILE = 'com.garmin.android.apps.connectmobile'
const USER_AGENT_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
const OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json'

// Runmate: URLSearchParams instead of `qs` (same output for these flat string/boolean params).
const stringify = (params: Record<string, string | boolean>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

type Retryable = AxiosRequestConfig & { _retry?: boolean; headers: Record<string, unknown> }
type Waiter = { resolve: (token: string) => void; reject: (err: unknown) => void }

export class HttpClient {
  client: AxiosInstance
  url: UrlClass
  oauth1Token: IOauth1Token | undefined
  oauth2Token: IOauth2Token | undefined
  OAUTH_CONSUMER: IOauth1Consumer | undefined
  // Runmate: per client, not module state as upstream (there one user's refresh could hand its token to another
  // user's waiting request, and a failed refresh left every later 401 waiting forever).
  private isRefreshing = false
  private refreshSubscribers: Waiter[] = []

  constructor(url: UrlClass) {
    this.url = url
    this.client = axios.create()
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error?.config as Retryable | undefined
        if (error?.response?.status === 401 && !originalRequest?._retry) {
          if (!this.oauth2Token) return
          if (this.isRefreshing) {
            try {
              const token = await new Promise<string>((resolve, reject) => { this.refreshSubscribers.push({ resolve, reject }) })
              originalRequest!.headers.Authorization = `Bearer ${token}`
              return this.client(originalRequest!)
            } catch (err) {
              // Runmate: upstream console.log'ed the raw error here (its request config holds the bearer token).
              logSafe('waiting for token refresh failed', err, this.secrets())
              return Promise.reject(safeError(err, this.secrets()))
            }
          }
          originalRequest!._retry = true
          this.isRefreshing = true
          const before = this.secrets()           // exchange() clears the old OAuth2 token before it posts
          try {
            await this.refreshOauth2Token()
          } catch (err) {
            // Runmate: reset the flag, fail the waiting requests, log and rethrow only a scrubbed error.
            const secrets = [...before, ...this.secrets()]
            const safe = safeError(err, secrets)
            this.isRefreshing = false
            const waiting = this.refreshSubscribers
            this.refreshSubscribers = []
            for (const w of waiting) w.reject(safe)
            logSafe('token refresh failed', err, secrets)
            throw safe
          }
          this.isRefreshing = false
          const token = this.oauth2Token!.access_token
          for (const w of this.refreshSubscribers) w.resolve(token)
          this.refreshSubscribers = []
          originalRequest!.headers.Authorization = `Bearer ${token}`
          return this.client(originalRequest!)
        }
        if (axios.isAxiosError(error) && error?.response) this.handleError(error.response)
        throw error
      },
    )
    this.client.interceptors.request.use(async (config) => {
      if (this.oauth2Token) config.headers.Authorization = 'Bearer ' + this.oauth2Token.access_token
      return config
    })
  }

  // Runmate: the values a log line or error message must never contain.
  private secrets() {
    return [
      this.oauth2Token?.access_token, this.oauth2Token?.refresh_token,
      this.oauth1Token?.oauth_token, this.oauth1Token?.oauth_token_secret,
      this.OAUTH_CONSUMER?.key, this.OAUTH_CONSUMER?.secret,
    ]
  }

  async fetchOauthConsumer() {
    const response = await axios.get(OAUTH_CONSUMER_URL)
    this.OAUTH_CONSUMER = { key: response.data.consumer_key, secret: response.data.consumer_secret }
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get(url, config)
    return response?.data
  }

  async post<T>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post(url, data, config)
    return response?.data
  }

  handleError(response: AxiosResponse) {
    this.handleHttpError(response)
  }

  // Runmate: upstream console.error'ed and threw "ERROR: (status), statusText, <response body>"; the body is gone.
  // lib/sources/garmin-login/client.ts replaces this with its own GarminHttpError.
  handleHttpError(response: AxiosResponse): never {
    const { status, statusText } = response
    throw new Error(`ERROR: (${status}), ${statusText}`)
  }

  async login(username: string, password: string): Promise<HttpClient> {
    await this.fetchOauthConsumer()
    const ticket = await this.getLoginTicket(username, password)
    const oauth1 = await this.getOauth1Token(ticket)
    // TODO: Handle MFA
    // Step 5: Oauth2
    await this.exchange(oauth1)
    return this
  }

  private async getLoginTicket(username: string, password: string): Promise<string> {
    const step1Params = { clientId: 'GarminConnect', locale: 'en', service: this.url.GC_MODERN }
    const step1Url = `${this.url.GARMIN_SSO_EMBED}?${stringify(step1Params)}`
    await this.client.get(step1Url)

    const step2Params = { id: 'gauth-widget', embedWidget: true, locale: 'en', gauthHost: this.url.GARMIN_SSO_EMBED }
    const step2Url = `${this.url.SIGNIN_URL}?${stringify(step2Params)}`
    const step2Result = await this.get<string>(step2Url)
    const csrfRegResult = CSRF_RE.exec(step2Result)
    if (!csrfRegResult) throw new Error('login - csrf not found')
    const csrf_token = csrfRegResult[1]

    const signinParams = {
      id: 'gauth-widget',
      embedWidget: true,
      clientId: 'GarminConnect',
      locale: 'en',
      gauthHost: this.url.GARMIN_SSO_EMBED,
      service: this.url.GARMIN_SSO_EMBED,
      source: this.url.GARMIN_SSO_EMBED,
      redirectAfterAccountLoginUrl: this.url.GARMIN_SSO_EMBED,
      redirectAfterAccountCreationUrl: this.url.GARMIN_SSO_EMBED,
    }
    const step3Url = `${this.url.SIGNIN_URL}?${stringify(signinParams)}`
    const step3Form = new FormData()
    step3Form.append('username', username)
    step3Form.append('password', password)
    step3Form.append('embed', 'true')
    step3Form.append('_csrf', csrf_token)
    const step3Result = await this.post<string>(step3Url, step3Form, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Dnt: 1,
        Origin: this.url.GARMIN_SSO_ORIGIN,
        Referer: this.url.SIGNIN_URL,
        'User-Agent': USER_AGENT_BROWSER,
      },
    })
    this.handleAccountLocked(step3Result)
    this.handlePageTitle(step3Result)
    this.handleMFA(step3Result)

    const ticketRegResult = TICKET_RE.exec(step3Result)
    if (!ticketRegResult) throw new Error('login failed (Ticket not found or MFA), please check username and password')
    return ticketRegResult[1]
  }

  // TODO: Handle MFA (lib/sources/garmin-login/client.ts replaces this with an MFA-page check)
  handleMFA(_htmlStr: string): void {}

  // Runmate: no longer logs the page title.
  handlePageTitle(htmlStr: string) {
    const pageTitleRegResult = PAGE_TITLE_RE.exec(htmlStr)
    if (pageTitleRegResult && pageTitleRegResult[1].includes('Update Phone Number')) {
      // See: https://github.com/matin/garth/issues/19
      throw new Error("login failed (Update Phone number), please update your phone number, currently I don't know where to update it")
    }
  }

  // Runmate: no longer logs the account status.
  handleAccountLocked(htmlStr: string) {
    if (ACCOUNT_LOCKED_RE.exec(htmlStr)) throw new Error('login failed (AccountLocked), please open connect web page to unlock your account')
  }

  async refreshOauth2Token() {
    if (!this.OAUTH_CONSUMER) await this.fetchOauthConsumer()
    if (!this.oauth2Token || !this.oauth1Token) throw new Error('No Oauth2Token or Oauth1Token')
    const oauth1 = { oauth: this.getOauthClient(this.OAUTH_CONSUMER!), token: this.oauth1Token }
    await this.exchange(oauth1)
  }

  private async getOauth1Token(ticket: string): Promise<IOauth1> {
    if (!this.OAUTH_CONSUMER) throw new Error('No OAUTH_CONSUMER')
    const params = { ticket, 'login-url': this.url.GARMIN_SSO_EMBED, 'accepts-mfa-tokens': true }
    const url = `${this.url.OAUTH_URL}/preauthorized?${stringify(params)}`
    const oauth = this.getOauthClient(this.OAUTH_CONSUMER)
    const headers = oauth.toHeader(oauth.authorize({ url, method: 'GET' }))
    const response = await this.get<string>(url, { headers: { ...headers, 'User-Agent': USER_AGENT_CONNECTMOBILE } })
    const token = Object.fromEntries(new URLSearchParams(response)) as unknown as IOauth1Token
    this.oauth1Token = token
    return { token, oauth }
  }

  private getOauthClient(consumer: IOauth1Consumer): OAuth {
    return new OAuth({
      consumer,
      signature_method: 'HMAC-SHA1',
      hash_function(base_string: string, key: string) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64')
      },
    })
  }

  private async exchange(oauth1: IOauth1) {
    const token = { key: oauth1.token.oauth_token, secret: oauth1.token.oauth_token_secret }
    const baseUrl = `${this.url.OAUTH_URL}/exchange/user/2.0`
    const requestData = { url: baseUrl, method: 'POST', data: null }
    const step5AuthData = oauth1.oauth.authorize(requestData, token) as unknown as Record<string, string>
    const url = `${baseUrl}?${stringify(step5AuthData)}`
    this.oauth2Token = undefined
    const response = await this.post<IOauth2Token>(url, null, {
      headers: { 'User-Agent': USER_AGENT_CONNECTMOBILE, 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    this.oauth2Token = this.setOauth2TokenExpiresAt(response)
  }

  // Runmate: Date instead of luxon; the two human-readable dates are ISO strings in UTC (nothing reads them).
  private setOauth2TokenExpiresAt(token: IOauth2Token): IOauth2Token {
    const now = Date.now() / 1000
    token.last_update_date = new Date(now * 1000).toISOString()
    token.expires_date = new Date((now + token.expires_in) * 1000).toISOString()
    token.expires_at = now + token.expires_in
    token.refresh_token_expires_at = now + token.refresh_token_expires_in
    return token
  }
}
