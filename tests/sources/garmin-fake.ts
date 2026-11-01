// A stand-in for the garmin-connect client (lib/sources/garmin-login/client.ts): synthetic Garmin JSON in the shapes
// the source reads (activity list, splits, chart data), and hooks to make login fail in each way Garmin does.
import { vi } from 'vitest'
import { setGarminClientFactory, type GarminClient } from '@/lib/sources/garmin-login/client'
import type { GarminListActivity } from '@/lib/sources/garmin-login/map'

export function listActivity(i: number, startUtc: Date, typeKey = 'running', km = 10): GarminListActivity {
  const local = new Date(startUtc.getTime() + 2 * 3600_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
  return {
    activityId: 1000 + i,
    activityName: `Synthetic ${typeKey} ${i}`,
    activityType: { typeKey, parentTypeId: 1 },
    startTimeLocal: fmt(local),
    startTimeGMT: fmt(startUtc),
    distance: km * 1000,
    duration: km * 330 + 20,
    movingDuration: km * 330,
    elevationGain: 42,
    averageSpeed: 1000 / 330,
    maxSpeed: 4.2,
    averageHR: 145,
    maxHR: 168,
    averageRunningCadenceInStepsPerMinute: 171.4,
    calories: km * 70,
    startLatitude: 47.0,
    startLongitude: 8.0,
    hasPolyline: true,
    hasSplits: true,
  }
}

export function chart(n = 120, start = Date.parse('2026-05-10T06:00:00Z')) {
  const keys = ['directTimestamp', 'sumDistance', 'sumMovingDuration', 'directSpeed', 'directElevation', 'directHeartRate', 'directRunCadence', 'directLatitude', 'directLongitude']
  return {
    activityId: 1000,
    measurementCount: keys.length,
    metricsCount: n,
    metricDescriptors: keys.map((key, metricsIndex) => ({ metricsIndex, key })),
    activityDetailMetrics: Array.from({ length: n }, (_, i) => ({
      metrics: [start + i * 10_000, i * 30, i * 10, 3, 400 + (i % 7), i % 10 === 3 ? null : 140 + (i % 9), 86, 47 + i * 0.00027, 8],
    })),
  }
}

export const SPLITS = { lapDTOs: [{ distance: 1000, duration: 330, elevationGain: 4, averageSpeed: 3.03, averageHR: 144 }, { distance: 1000, duration: 325, elevationGain: 2, averageSpeed: 3.08, averageHR: 147 }] }

export interface FakeGarmin {
  activities: GarminListActivity[]
  loginError: unknown
  profileError: unknown
  created: { username: string; password: string }[]
  logins: number
  client: GarminClient | null
}

export function installFakeGarmin(): FakeGarmin & { restore: () => void } {
  const state: FakeGarmin = { activities: [], loginError: null, profileError: null, created: [], logins: 0, client: null }
  setGarminClientFactory((credentials) => {
    state.created.push(credentials)
    const client: GarminClient = {
      login: vi.fn(async () => { state.logins++; if (state.loginError) throw state.loginError; return {} }),
      loadToken: vi.fn(),
      exportToken: () => ({ oauth1: { oauth_token: 'oauth1-token-value', oauth_token_secret: 'oauth1-secret-value' }, oauth2: { access_token: 'oauth2-access-value' } }),
      getUserProfile: vi.fn(async () => { if (state.profileError) throw state.profileError; return {} }),
      getActivities: vi.fn(async (start: number, limit: number) => state.activities.slice(start, start + limit)),
      get: vi.fn(async (url: string) => (url.endsWith('/splits') ? SPLITS : chart())) as GarminClient['get'],
    }
    state.client = client
    return client
  })
  return Object.assign(state, { restore: () => setGarminClientFactory(null) })
}
