import { sql } from 'drizzle-orm'
import { boolean, foreignKey, index, integer, pgTable, primaryKey, real, text, unique } from 'drizzle-orm/pg-core'

const unixNow = sql`floor(extract(epoch from now()))::integer`

// Every user-owned table carries `user_id` (the Clerk user id) and is keyed by it (Phase 2). All reads and writes go
// through lib/db/owned.ts; tests/db/scoping.test.ts flags queries on these tables without the owner filter.
const userId = () => text('user_id').notNull()

// ─── Settings (key-value store per user) ──────────────────────────────────────

export const settings = pgTable('settings', {
  userId: userId(),
  key: text('key').notNull(),
  value: text('value').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.key] })])

// ─── Profile (Phase 2): HR model, athlete facts, time zone, locale ─────────────

export const userProfile = pgTable('user_profile', {
  userId: userId().primaryKey(),
  hrMax: integer('hr_max'),
  hrRest: integer('hr_rest'),
  lthr: integer('lthr'),
  zoneModel: text('zone_model'),                 // 'hrmax' | 'lthr'
  pbTime: text('pb_time'),
  pbRace: text('pb_race'),
  pbHr: integer('pb_hr'),
  vo2max: real('vo2max'),
  weightKg: real('weight_kg'),
  easyPace: text('easy_pace'),
  timezone: text('timezone'),
  locale: text('locale'),
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

// ─── Secret links: calendar feed and Apple Health upload (token → user) ───────

export const linkTokens = pgTable('link_tokens', {
  token: text('token').primaryKey(),
  userId: userId(),
  kind: text('kind').notNull(),                  // 'calendar' | 'health'
  createdAt: integer('created_at').notNull().default(unixNow),
}, (t) => [unique('link_tokens_user_kind').on(t.userId, t.kind)])

// ─── Garmin (per user; every secret AES-256-GCM encrypted, lib/crypto.ts) ─────

// Credentials and the persisted session (OAuth1 + OAuth2 JSON). Serverless invocations restore the session rather than
// logging in on every request.
export const garminAccounts = pgTable('garmin_accounts', {
  userId: userId().primaryKey(),
  usernameEnc: text('username_enc').notNull(),
  passwordEnc: text('password_enc').notNull(),
  sessionEnc: text('session_enc'),               // { oauth1, oauth2 } as JSON, encrypted
  sessionAt: integer('session_at'),
  syncedAt: integer('synced_at'),                // last sync attempt (the cron starts with the oldest)
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

// ─── Activities ───────────────────────────────────────────────────────────────

export const activities = pgTable('activities', {
  userId: userId(),
  id: text('id').notNull(),
  stravaId: text('strava_id'),                          // legacy — populated for pre-Garmin rows
  garminActivityId: text('garmin_activity_id'),
  type: text('type').notNull(),
  sportType: text('sport_type'),                        // e.g. 'TrailRun', 'Race'
  workoutType: integer('workout_type'),                 // 0=default 1=race 2=long 3=workout
  name: text('name').notNull(),
  description: text('description'),
  distanceM: real('distance_m').notNull(),
  durationS: integer('duration_s').notNull(),
  elapsedTimeS: integer('elapsed_time_s'),
  elevationM: real('elevation_m'),
  averageHr: integer('average_hr'),
  maxHr: integer('max_hr'),
  avgCadence: integer('avg_cadence'),
  averagePaceSPerKm: integer('average_pace_s_per_km'),
  averageSpeedMs: real('average_speed_ms'),
  maxSpeedMs: real('max_speed_ms'),
  calories: integer('calories'),
  sufferScore: integer('suffer_score'),
  perceivedExertion: integer('perceived_exertion'),     // RPE 1-10
  prCount: integer('pr_count'),
  kudosCount: integer('kudos_count'),
  achievementCount: integer('achievement_count'),
  gearId: text('gear_id'),
  startLat: real('start_lat'),
  startLng: real('start_lng'),
  startTime: text('start_time'),                        // 'HH:MM:SS'
  summaryPolyline: text('summary_polyline'),
  bestEffortsJson: text('best_efforts_json'),
  splitsMetricJson: text('splits_metric_json'),
  hasDetailedData: boolean('has_detailed_data').notNull().default(false),
  hasStreams: boolean('has_streams').notNull().default(false),
  date: text('date').notNull(),
  notes: text('notes'),
  metricsJson: text('metrics_json'),                    // RunMetrics (lib/analytics/run-metrics.ts)
  runTypeOverride: text('run_type_override'),           // manual correction of the detected run type
  syncedAt: integer('synced_at').notNull().default(unixNow),
}, (t) => [
  primaryKey({ columns: [t.userId, t.id] }),
  unique('activities_user_garmin').on(t.userId, t.garminActivityId),
  index('activities_user_date').on(t.userId, t.date),
])

// ─── Training Plan (history before the first block; one row per user) ─────────

export const trainingPlan = pgTable('training_plan', {
  userId: userId().primaryKey(),
  planJson: text('plan_json').notNull(),
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

// ─── Activity Streams ─────────────────────────────────────────────────────────

export const activityStreams = pgTable('activity_streams', {
  userId: userId(),
  activityId: text('activity_id').notNull(),
  stravaId: text('strava_id'),                          // kept for legacy lookups
  timeJson: text('time_json'),
  distanceJson: text('distance_json'),
  altitudeJson: text('altitude_json'),
  heartrateJson: text('heartrate_json'),
  cadenceJson: text('cadence_json'),
  gradeJson: text('grade_smooth_json'),
  latlngJson: text('latlng_json'),
  movingJson: text('moving_json'),                      // cumulative moving seconds
  speedJson: text('speed_json'),                        // m/s
  temperatureJson: text('temperature_json'),            // °C
  fetchedAt: integer('fetched_at').notNull().default(unixNow),
}, (t) => [
  primaryKey({ columns: [t.userId, t.activityId] }),
  foreignKey({ columns: [t.userId, t.activityId], foreignColumns: [activities.userId, activities.id] }).onDelete('cascade'),
])

// ─── Apple Health (09-07): from the daily iOS Shortcut ────────────────────────

export const healthDays = pgTable('health_days', {
  userId: userId(),
  date: text('date').notNull(),                  // 'YYYY-MM-DD' (the day the values belong to)
  sleepMin: integer('sleep_min'),                // asleep, minutes (night ending that morning)
  restingHr: integer('resting_hr'),
  hrvMs: real('hrv_ms'),                         // SDNN, ms (Apple's HRV)
  steps: integer('steps'),
  activeKcal: integer('active_kcal'),
  weightKg: real('weight_kg'),
  source: text('source').notNull().default('apple-health'),
  updatedAt: integer('updated_at').notNull().default(unixNow),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })])

export const healthWorkouts = pgTable('health_workouts', {
  userId: userId(),
  id: text('id').notNull(),                      // hash of date + start + type (re-sends replace)
  date: text('date').notNull(),
  type: text('type').notNull(),                  // Apple's workout type as sent, e.g. 'Traditional Strength Training'
  start: text('start').notNull(),                // ISO start time
  minutes: real('minutes').notNull(),
  kcal: integer('kcal'),
  avgHr: integer('avg_hr'),
  createdAt: integer('created_at').notNull().default(unixNow),
}, (t) => [primaryKey({ columns: [t.userId, t.id] }), index('health_workouts_user_date').on(t.userId, t.date)])
