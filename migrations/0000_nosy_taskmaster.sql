CREATE TABLE IF NOT EXISTS "sp500_evaluation_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_id" integer NOT NULL,
	"calculation_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sp500_evaluation_revisions"
   ADD CONSTRAINT "sp500_evaluation_revisions_change_id_sp500_changes_id_fk"
   FOREIGN KEY ("change_id") REFERENCES "public"."sp500_changes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "sp500_evaluation_revisions" ("change_id", "calculation_version", "snapshot", "created_at")
SELECT c."id", 1, c."snapshot", c."created_at"
FROM "sp500_changes" c
WHERE NOT EXISTS (
	SELECT 1 FROM "sp500_evaluation_revisions" r
	WHERE r."change_id" = c."id" AND r."calculation_version" = 1
);