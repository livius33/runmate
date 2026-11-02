// SPDX-License-Identifier: MIT
// Vendored from garmin-connect 1.6.2 (Copyright (c) 2020 Oskar Bernberg, MIT: see LICENSE in this folder), file
// src/garmin/GarminConnect.ts — only the methods Runmate's Garmin source uses. README.md lists the changes.
import type { AxiosRequestConfig } from 'axios'
import { HttpClient, type IOauth1Token, type IOauth2Token } from './http-client'
import { UrlClass } from './urls'

export type { IOauth1Token, IOauth2Token } from './http-client'
export { GarminConnectError } from './redact'

export interface GCCredentials { username: string; password: string }

export class GarminConnect {
  client: HttpClient
  private credentials: GCCredentials
  private url: UrlClass

  // Runmate: credentials are required (upstream fell back to a garmin.config.json next to the app).
  constructor(credentials: GCCredentials, domain: 'garmin.com' | 'garmin.cn' = 'garmin.com') {
    if (!credentials) throw new Error('Missing credentials')
    this.credentials = credentials
    this.url = new UrlClass(domain)
    this.client = new HttpClient(this.url)
  }

  async login(username?: string, password?: string): Promise<GarminConnect> {
    if (username && password) {
      this.credentials.username = username
      this.credentials.password = password
    }
    await this.client.login(this.credentials.username, this.credentials.password)
    return this
  }

  exportToken(): { oauth1: IOauth1Token; oauth2: IOauth2Token } {
    if (!this.client.oauth1Token || !this.client.oauth2Token) throw new Error('exportToken: Token not found')
    return { oauth1: this.client.oauth1Token, oauth2: this.client.oauth2Token }
  }

  loadToken(oauth1: IOauth1Token, oauth2: IOauth2Token): void {
    this.client.oauth1Token = oauth1
    this.client.oauth2Token = oauth2
  }

  async getUserProfile(): Promise<unknown> {
    return this.client.get(this.url.USER_PROFILE)
  }

  async getActivities(start?: number, limit?: number, activityType?: string, subActivityType?: string): Promise<unknown[]> {
    return this.client.get(this.url.ACTIVITIES, { params: { start, limit, activityType, subActivityType } })
  }

  async get<T>(url: string, data?: AxiosRequestConfig): Promise<T> {
    return this.client.get<T>(url, data)
  }
}
