import { existsSync, readFileSync } from 'fs'
import { Pool } from '@neondatabase/serverless'

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const url = new URL('../' + name, import.meta.url)
    if (existsSync(url)) {
      return Object.fromEntries(
        readFileSync(url, 'utf8')
          .split('\n').filter(l => l && !l.startsWith('#'))
          .map(l => l.split('=').map((p, i) => i === 0 ? p.trim() : l.slice(l.indexOf('=') + 1).trim()))
      )
    }
  }
  throw new Error('No .env.local or .env found')
}
const DATABASE_URL = process.env.DATABASE_URL ?? loadEnv().DATABASE_URL

const pool = new Pool({ connectionString: DATABASE_URL })

const statements = [
  // ── Base tables (idempotent) ──────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "settings" (
    "key" text PRIMARY KEY,
    "value" text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "api_cache" (
    "key" text PRIMARY KEY,
    "data" text NOT NULL,
    "fetched_at" integer NOT NULL,
    "ttl_seconds" integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "strava_tokens" (
    "id" serial PRIMARY KEY,
    "access_token" text NOT NULL,
    "refresh_token" text NOT NULL,
    "expires_at" integer NOT NULL,
    "athlete_id" integer NOT NULL,
    "updated_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "activities" (
    "id" text PRIMARY KEY,
    "strava_id" text UNIQUE,
    "type" text NOT NULL,
    "name" text NOT NULL,
    "distance_m" real NOT NULL,
    "duration_s" integer NOT NULL,
    "date" text NOT NULL,
    "synced_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "training_plan" (
    "id" integer PRIMARY KEY,
    "plan_json" text NOT NULL,
    "updated_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "activity_streams" (
    "strava_id" text PRIMARY KEY REFERENCES activities(strava_id),
    "time_json" text,
    "distance_json" text,
    "altitude_json" text,
    "heartrate_json" text,
    "cadence_json" text,
    "grade_smooth_json" text,
    "latlng_json" text,
    "fetched_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "athlete_stats" (
    "athlete_id" integer PRIMARY KEY,
    "recent_run_count" integer,
    "recent_run_distance_m" real,
    "recent_run_moving_time_s" integer,
    "recent_run_elevation_m" real,
    "ytd_run_count" integer,
    "ytd_run_distance_m" real,
    "ytd_run_moving_time_s" integer,
    "ytd_run_elevation_m" real,
    "all_run_count" integer,
    "all_run_distance_m" real,
    "all_run_moving_time_s" integer,
    "all_run_elevation_m" real,
    "fetched_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  // ── New tables from extended schema ──────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "athlete" (
    "athlete_id" integer PRIMARY KEY,
    "firstname" text, "lastname" text, "city" text, "country" text,
    "sex" text, "weight" real, "ftp" integer, "profile" text,
    "measurement_preference" text,
    "fetched_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "gear" (
    "id" text PRIMARY KEY,
    "name" text NOT NULL, "brand_name" text, "model_name" text,
    "distance_m" real NOT NULL DEFAULT 0,
    "retired" boolean NOT NULL DEFAULT false,
    "primary" boolean NOT NULL DEFAULT false,
    "fetched_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "heart_rate_zones" (
    "athlete_id" integer PRIMARY KEY,
    "custom_zones" boolean NOT NULL DEFAULT false,
    "zone1_min" integer, "zone1_max" integer,
    "zone2_min" integer, "zone2_max" integer,
    "zone3_min" integer, "zone3_max" integer,
    "zone4_min" integer, "zone4_max" integer,
    "zone5_min" integer, "zone5_max" integer,
    "fetched_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  // ── Extra columns on activities (safe to re-run) ──────────────────────────
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "elapsed_time_s" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "elevation_m" real`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "average_hr" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "max_hr" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "avg_cadence" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "average_pace_s_per_km" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "suffer_score" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "kudos_count" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "achievement_count" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "start_lat" real`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "start_lng" real`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "summary_polyline" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "best_efforts_json" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "splits_metric_json" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "has_detailed_data" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "has_streams" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "notes" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "sport_type" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "workout_type" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "metrics_json" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "run_type_override" text`,
  `ALTER TABLE "activity_streams" ADD COLUMN IF NOT EXISTS "moving_json" text`,
  `ALTER TABLE "activity_streams" ADD COLUMN IF NOT EXISTS "speed_json" text`,
  `ALTER TABLE "activity_streams" ADD COLUMN IF NOT EXISTS "temperature_json" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "description" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "average_speed_ms" real`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "max_speed_ms" real`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "calories" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "perceived_exertion" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "pr_count" integer`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "gear_id" text`,
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "start_time" text`,
  // ── Garmin migration ──────────────────────────────────────────────────────
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "garmin_activity_id" text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "activities_garmin_activity_id_key" ON "activities"("garmin_activity_id") WHERE "garmin_activity_id" IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "garmin_tokens" (
    "id" serial PRIMARY KEY,
    "oauth1_token" text NOT NULL,
    "oauth1_secret" text NOT NULL,
    "oauth2_json" text,
    "updated_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  // Steps are individually try/catch'd — safe to re-run.
  `ALTER TABLE "activity_streams" ADD COLUMN IF NOT EXISTS "activity_id" text`,
  `UPDATE "activity_streams" SET "activity_id" = (
     SELECT "id" FROM "activities" WHERE "activities"."strava_id" = "activity_streams"."strava_id"
   ) WHERE "activity_id" IS NULL`,
  `ALTER TABLE "activity_streams" DROP CONSTRAINT IF EXISTS "activity_streams_strava_id_activities_strava_id_fk"`,
  `ALTER TABLE "activity_streams" DROP CONSTRAINT IF EXISTS "activity_streams_pkey"`,
  `ALTER TABLE "activity_streams" ALTER COLUMN "activity_id" SET NOT NULL`,
  `ALTER TABLE "activity_streams" ADD PRIMARY KEY ("activity_id")`,
  `ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_fkey"
     FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE`,
  // strava_id is legacy/optional post-Garmin-migration — the rekey above never relaxed it.
  `ALTER TABLE "activity_streams" ALTER COLUMN "strava_id" DROP NOT NULL`,
  // Apple Health (09-07): one row per day from the iOS Shortcut, plus non-running workouts.
  `CREATE TABLE IF NOT EXISTS "health_days" (
    "date" text PRIMARY KEY,
    "sleep_min" integer,
    "resting_hr" integer,
    "hrv_ms" real,
    "steps" integer,
    "active_kcal" integer,
    "weight_kg" real,
    "source" text NOT NULL DEFAULT 'apple-health',
    "updated_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE TABLE IF NOT EXISTS "health_workouts" (
    "id" text PRIMARY KEY,
    "date" text NOT NULL,
    "type" text NOT NULL,
    "start" text NOT NULL,
    "minutes" real NOT NULL,
    "kcal" integer,
    "avg_hr" integer,
    "created_at" integer NOT NULL DEFAULT floor(extract(epoch from now()))::integer
  )`,
  `CREATE INDEX IF NOT EXISTS "health_workouts_date_idx" ON "health_workouts" ("date")`,
]

// Optional filter: `node scripts/migrate-schema.mjs health_` runs only the statements that mention it
// (new tables without re-running the older ALTER steps).
const only = process.argv[2]
for (const stmt of only ? statements.filter((s) => s.includes(only)) : statements) {
  try {
    await pool.query(stmt)
    console.log('✓', stmt.slice(0, 70).replace(/\n/g, ' ').trim())
  } catch (e) {
    console.error('✗', e.message, '\n  SQL:', stmt.slice(0, 70).replace(/\n/g, ' ').trim())
  }
}
await pool.end()
console.log('\nDone.')
