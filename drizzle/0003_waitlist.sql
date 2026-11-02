CREATE TABLE IF NOT EXISTS "waitlist" (
	"email" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" integer NOT NULL,
	"confirmed_at" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waitlist_token" ON "waitlist" USING btree ("token_hash");