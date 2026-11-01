import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, real, serial, text } from 'drizzle-orm/pg-core'

const unixNow = sql`floor(extract(epoch from now()))::integer`

// ─── Settings (key-value store for app credentials) ───────────────────────────

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// ─── Cache ────────────────────────────────────────────────────────────────────

export const apiCache = pgTable('api_cache', {
  key: text('key').primaryKey(),
  data: text('data').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
  ttlSeconds: integer('ttl_seconds').notNull(),
})

// ─── Garmin / Strava (legacy) / Running ───────────────────────────────────────

// Legacy Strava tokens — kept for schema compatibility with existing rows.
// No new code writes here; safe to drop the table once you're happy.
export const stravaTokens = pgTable('strava_tokens', {
  id: serial('id').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  athleteId: integer('athlete_id').notNull(),
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

// Persisted Garmin session (OAuth1 access token + optional OAuth2 blob).
// Serverless invocations restore this rather than re-logging on every request.
export const garminTokens = pgTable('garmin_tokens', {
  id: serial('id').primaryKey(),
  oauth1Token: text('oauth1_token').notNull(),
  oauth1Secret: text('oauth1_secret').notNull(),
  oauth2Json: text('oauth2_json'),
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

export const athlete = pgTable('athlete', {
  athleteId: integer('athlete_id').primaryKey(),
  firstname: text('firstname'),
  lastname: text('lastname'),
  city: text('city'),
  country: text('country'),
  sex: text('sex'),
  weight: real('weight'),         // kg
  ftp: integer('ftp'),            // functional threshold power (watts)
  profile: text('profile'),       // avatar URL
  measurementPreference: text('measurement_preference'), // 'feet' | 'meters'
  fetchedAt: integer('fetched_at').notNull().default(unixNow),
})

export const gear = pgTable('gear', {
  id: text('id').primaryKey(),    // Strava gear ID e.g. "g12345"
  name: text('name').notNull(),
  brandName: text('brand_name'),
  modelName: text('model_name'),
  distanceM: real('distance_m').notNull().default(0),
  retired: boolean('retired').notNull().default(false),
  primary: boolean('primary').notNull().default(false),
  fetchedAt: integer('fetched_at').notNull().default(unixNow),
})

export const heartRateZones = pgTable('heart_rate_zones', {
  athleteId: integer('athlete_id').primaryKey(),
  customZones: boolean('custom_zones').notNull().default(false),
  zone1Min: integer('zone1_min'),
  zone1Max: integer('zone1_max'),
  zone2Min: integer('zone2_min'),
  zone2Max: integer('zone2_max'),
  zone3Min: integer('zone3_min'),
  zone3Max: integer('zone3_max'),
  zone4Min: integer('zone4_min'),
  zone4Max: integer('zone4_max'),
  zone5Min: integer('zone5_min'),
  zone5Max: integer('zone5_max'),
  fetchedAt: integer('fetched_at').notNull().default(unixNow),
})

export const activities = pgTable('activities', {
  id: text('id').primaryKey(),
  stravaId: text('strava_id').unique(),                 // legacy — populated for pre-Garmin rows
  garminActivityId: text('garmin_activity_id').unique(),
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
  gearId: text('gear_id'),                              // references gear.id
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
})

// ─── Training Plan ────────────────────────────────────────────────────────────

export const trainingPlan = pgTable('training_plan', {
  id: integer('id').primaryKey(),
  planJson: text('plan_json').notNull(),
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

// ─── Activity Streams ─────────────────────────────────────────────────────────

export const activityStreams = pgTable('activity_streams', {
  activityId: text('activity_id').primaryKey()
    .references(() => activities.id, { onDelete: 'cascade' }),
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
})

// ─── Athlete Stats ────────────────────────────────────────────────────────────

export const athleteStats = pgTable('athlete_stats', {
  athleteId: integer('athlete_id').primaryKey(),
  recentRunCount: integer('recent_run_count'),
  recentRunDistanceM: real('recent_run_distance_m'),
  recentRunMovingTimeS: integer('recent_run_moving_time_s'),
  recentRunElevationM: real('recent_run_elevation_m'),
  ytdRunCount: integer('ytd_run_count'),
  ytdRunDistanceM: real('ytd_run_distance_m'),
  ytdRunMovingTimeS: integer('ytd_run_moving_time_s'),
  ytdRunElevationM: real('ytd_run_elevation_m'),
  allRunCount: integer('all_run_count'),
  allRunDistanceM: real('all_run_distance_m'),
  allRunMovingTimeS: integer('all_run_moving_time_s'),
  allRunElevationM: real('all_run_elevation_m'),
  fetchedAt: integer('fetched_at').notNull().default(unixNow),
})

// ─── Apple Health (09-07): from the daily iOS Shortcut ────────────────────────

export const healthDays = pgTable('health_days', {
  date: text('date').primaryKey(),               // 'YYYY-MM-DD' (the day the values belong to)
  sleepMin: integer('sleep_min'),                // asleep, minutes (night ending that morning)
  restingHr: integer('resting_hr'),
  hrvMs: real('hrv_ms'),                         // SDNN, ms (Apple's HRV)
  steps: integer('steps'),
  activeKcal: integer('active_kcal'),
  weightKg: real('weight_kg'),
  source: text('source').notNull().default('apple-health'),
  updatedAt: integer('updated_at').notNull().default(unixNow),
})

export const healthWorkouts = pgTable('health_workouts', {
  id: text('id').primaryKey(),                   // hash of date + start + type (re-sends replace)
  date: text('date').notNull(),
  type: text('type').notNull(),                  // Apple's workout type as sent, e.g. 'Traditional Strength Training'
  start: text('start').notNull(),                // ISO start time
  minutes: real('minutes').notNull(),
  kcal: integer('kcal'),
  avgHr: integer('avg_hr'),
  createdAt: integer('created_at').notNull().default(unixNow),
})
