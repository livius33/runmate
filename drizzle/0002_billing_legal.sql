CREATE TABLE IF NOT EXISTS "billing_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" integer,
	"processed_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consents" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"granted_at" integer NOT NULL,
	"revoked_at" integer,
	CONSTRAINT "consents_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"tier" text,
	"interval" text,
	"trial_ends_at" integer,
	"paddle_customer_id" text,
	"paddle_subscription_id" text,
	"price_id" text,
	"current_period_end" integer,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" integer,
	"event_at" integer,
	"updated_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_paddle_sub" ON "subscription" USING btree ("paddle_subscription_id");