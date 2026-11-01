-- Phase 3: neutral source ids on activities (replacing garmin_activity_id and the Strava-era strava_id columns),
-- a UTC start for the cross-source duplicate check, and consent + error state for the Garmin login source.
-- Existing rows: Garmin activities keep their id as source_activity_id; rows without one were manual entries.
ALTER TABLE "activities" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "source_activity_id" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "started_at" integer;--> statement-breakpoint
UPDATE "activities" SET "source" = CASE WHEN "garmin_activity_id" IS NOT NULL THEN 'garmin' ELSE 'manual' END, "source_activity_id" = "garmin_activity_id";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_user_garmin";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN IF EXISTS "strava_id";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN IF EXISTS "garmin_activity_id";--> statement-breakpoint
ALTER TABLE "activity_streams" DROP COLUMN IF EXISTS "strava_id";--> statement-breakpoint
ALTER TABLE "garmin_accounts" ADD COLUMN "consented_at" integer;--> statement-breakpoint
ALTER TABLE "garmin_accounts" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "garmin_accounts" ADD COLUMN "error_at" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_user_started" ON "activities" USING btree ("user_id","started_at");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_source_id" UNIQUE("user_id","source","source_activity_id");
