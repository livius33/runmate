// SPDX-License-Identifier: MIT
// Vendored from garmin-connect 1.6.2 (Copyright (c) 2020 Oskar Bernberg, MIT: see LICENSE in this folder), file
// src/garmin/UrlClass.ts — only the URLs Runmate's Garmin source uses.

export class UrlClass {
  readonly GC_MODERN: string
  readonly GARMIN_SSO_ORIGIN: string
  readonly GC_API: string

  constructor(readonly domain = 'garmin.com') {
    this.GC_MODERN = `https://connect.${this.domain}/modern`
    this.GARMIN_SSO_ORIGIN = `https://sso.${this.domain}`
    this.GC_API = `https://connectapi.${this.domain}`
  }
  get GARMIN_SSO() { return `${this.GARMIN_SSO_ORIGIN}/sso` }
  get GARMIN_SSO_EMBED() { return `${this.GARMIN_SSO_ORIGIN}/sso/embed` }
  get SIGNIN_URL() { return `${this.GARMIN_SSO}/signin` }
  get OAUTH_URL() { return `${this.GC_API}/oauth-service/oauth` }
  get USER_PROFILE() { return `${this.GC_API}/userprofile-service/socialProfile` }
  get ACTIVITIES() { return `${this.GC_API}/activitylist-service/activities/search/activities` }
}
