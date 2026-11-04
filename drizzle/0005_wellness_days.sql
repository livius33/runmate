CREATE TABLE IF NOT EXISTS "wellness_days" (
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"source" text NOT NULL,
	"sleep_s" integer,
	"deep_s" integer,
	"rem_s" integer,
	"sleep_score" integer,
	"hrv_avg" integer,
	"hrv_status" text,
	"rhr" integer,
	"rhr_source" text,
	"fetched_at" integer DEFAULT floor(extract(epoch from now()))::integer NOT NULL,
	CONSTRAINT "wellness_days_user_id_date_pk" PRIMARY KEY("user_id","date")
);
