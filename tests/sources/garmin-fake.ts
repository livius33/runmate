// A stand-in for the garmin-connect client (lib/sources/garmin-login/client.ts): synthetic Garmin JSON in the shapes
// the source reads (activity list, splits, chart data, sleep and daily heart rate), and hooks to make login fail in
// each way Garmin does.
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

// dailySleepData: dailySleepDTO with sleepTimeSeconds, deep/REM and sleepScores; avgOvernightHrv, hrvStatus and
// restingHeartRate on top. Synthetic values.
export const sleepNight = (o: { sleepS?: number | null; hrv?: number | null; status?: string | null; rhr?: number | null; score?: number } = {}) => ({
  dailySleepDTO: {
    id: 1, userProfilePK: 1, calendarDate: '2026-05-10',
    sleepTimeSeconds: o.sleepS === undefined ? 24000 : o.sleepS,
    deepSleepSeconds: 5400, lightSleepSeconds: 12600, remSleepSeconds: 6000, awakeSleepSeconds: 900,
    sleepStartTimestampGMT: 1778364000000, sleepEndTimestampGMT: 1778388000000,
    sleepScores: { totalDuration: { qualifierKey: 'FAIR' }, stress: { qualifierKey: 'GOOD' }, overall: { value: o.score ?? 78, qualifierKey: 'FAIR' } },
  },
  sleepMovement: [], remSleepData: true, sleepLevels: [], restlessMomentsCount: 12,
  avgOvernightHrv: o.hrv === undefined ? 58 : o.hrv,
  hrvStatus: o.status === undefined ? 'BALANCED' : o.status,
  bodyBatteryChange: 54,
  restingHeartRate: o.rhr === undefined ? 52 : o.rhr,
})

// A night without the watch: the DTO exists, all values null, no HRV.
export const emptyNightResponse = {
  dailySleepDTO: {
    id: 1, userProfilePK: 1, calendarDate: '2026-05-11', sleepTimeSeconds: null, napTimeSeconds: 0,
    deepSleepSeconds: null, lightSleepSeconds: null, remSleepSeconds: null, awakeSleepSeconds: null,
    sleepWindowConfirmed: false, sleepFromDevice: false,
  },
  remSleepData: false, restlessMomentsCount: 0,
}

// Same night, but Garmin also sends the day's resting HR: not a night value.
export const emptyNightWithDayRhr = { ...emptyNightResponse, restingHeartRate: 75 }

export const heartRateDay = (rhr: number | null) => ({ calendarDate: '2026-05-10', restingHeartRate: rhr, maxHeartRate: 160, minHeartRate: rhr })

const dateOf = (url: string) => /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(url)?.[1] ?? ''

export interface FakeGarmin {
  activities: GarminListActivity[]
  sleep: Record<string, unknown>          // date → dailySleepData response (default: a night without the watch)
  restingHr: number | null                // dailyHeartRate's resting HR
  wellnessError: ((url: string) => unknown) | null   // returns an error to throw for that sleep / heart-rate request
  loginError: unknown
  profileError: unknown
  created: { username: string; password: string }[]
  logins: number
  client: GarminClient | null
}

export function installFakeGarmin(): FakeGarmin & { restore: () => void } {
  const state: FakeGarmin = { activities: [], sleep: {}, restingHr: null, wellnessError: null, loginError: null, profileError: null, created: [], logins: 0, client: null }
  setGarminClientFactory((credentials) => {
    state.created.push(credentials)
    const client: GarminClient = {
      login: vi.fn(async () => { state.logins++; if (state.loginError) throw state.loginError; return {} }),
      loadToken: vi.fn(),
      exportToken: () => ({ oauth1: { oauth_token: 'oauth1-token-value', oauth_token_secret: 'oauth1-secret-value' }, oauth2: { access_token: 'oauth2-access-value' } }),
      getUserProfile: vi.fn(async () => { if (state.profileError) throw state.profileError; return {} }),
      getActivities: vi.fn(async (start: number, limit: number) => state.activities.slice(start, start + limit)),
      get: vi.fn(async (url: string) => {
        if (/sleep-service|wellness-service/.test(url)) {
          const err = state.wellnessError?.(url)
          if (err) throw err
          return url.includes('/dailySleepData') ? state.sleep[dateOf(url)] ?? emptyNightResponse : heartRateDay(state.restingHr)
        }
        return url.endsWith('/splits') ? SPLITS : chart()
      }) as GarminClient['get'],
    }
    state.client = client
    return client
  })
  return Object.assign(state, { restore: () => setGarminClientFactory(null) })
}
