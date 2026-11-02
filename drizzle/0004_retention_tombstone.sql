CREATE TABLE IF NOT EXISTS "deleted_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"deleted_at" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "last_seen_at" integer;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "notice_sent_at" integer;