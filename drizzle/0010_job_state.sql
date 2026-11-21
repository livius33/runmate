CREATE TABLE IF NOT EXISTS "job_state" (
	"name" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" integer NOT NULL
);
