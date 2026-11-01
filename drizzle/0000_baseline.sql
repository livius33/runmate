CREATE TABLE IF NOT EXISTS "activities" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"strava_id" text,
	"garmin_activity_id" text,
	"type" text NOT NULL,
	"sport_type" text,
	"workout_type" integer,
	"name" text NOT NULL,
	"description" text,
	"distance_m" real NOT NULL,
	"duration_s" integer NOT NULL,
	"elapsed_time_s" integer,
	"elevation_m" real,
	"average_hr" integer,
	"max_hr" integer,
	"avg_cadence" integer,
	"average_pace_s_per_km" integer,
	"average_speed_ms" real,
	"max_speed_ms" real,
	"calories" integer,
	"suffer_score" integer,
	"perceived_exertion" integer,
	"pr_count" integer,
	"kudos_count" integer,
	"achievement_count" integer,
	"gear_id" text,
	"start_lat" real,
	"start_lng" real,
	"start_time" text,
	"summary_polyline" text,
	"best_efforts_json" text,
	"splits_metric_json" text,
	"has_detailed_data" boolean DEFAULT false NOT NULL,
	"has_streams" boolean DEFAULT false NOT NULL,
	"date" text NOT NULL,
	"notes" text,
	"metrics_json" text,
	"run_type_override" text,
	"synced_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL,
	CONSTRAINT "activities_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "activities_user_garmin" UNIQUE("user_id","garmin_activity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_streams" (
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"strava_id" text,
	"time_json" text,
	"distance_json" text,
	"altitude_json" text,
	"heartrate_json" text,
	"cadence_json" text,
	"grade_smooth_json" text,
	"latlng_json" text,
	"moving_json" text,
	"speed_json" text,
	"temperature_json" text,
	"fetched_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL,
	CONSTRAINT "activity_streams_user_id_activity_id_pk" PRIMARY KEY("user_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "garmin_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username_enc" text NOT NULL,
	"password_enc" text NOT NULL,
	"session_enc" text,
	"session_at" integer,
	"synced_at" integer,
	"updated_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_days" (
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"sleep_min" integer,
	"resting_hr" integer,
	"hrv_ms" real,
	"steps" integer,
	"active_kcal" integer,
	"weight_kg" real,
	"source" text DEFAULT 'apple-health' NOT NULL,
	"updated_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL,
	CONSTRAINT "health_days_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "health_workouts" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"start" text NOT NULL,
	"minutes" real NOT NULL,
	"kcal" integer,
	"avg_hr" integer,
	"created_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL,
	CONSTRAINT "health_workouts_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL,
	CONSTRAINT "link_tokens_user_kind" UNIQUE("user_id","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_plan" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_json" text NOT NULL,
	"updated_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hr_max" integer,
	"hr_rest" integer,
	"lthr" integer,
	"zone_model" text,
	"pb_time" text,
	"pb_race" text,
	"pb_hr" integer,
	"vo2max" real,
	"weight_kg" real,
	"easy_pace" text,
	"timezone" text,
	"locale" text,
	"updated_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_user_id_activity_id_activities_user_id_id_fk" FOREIGN KEY ("user_id","activity_id") REFERENCES "public"."activities"("user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_user_date" ON "activities" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "health_workouts_user_date" ON "health_workouts" USING btree ("user_id","date");