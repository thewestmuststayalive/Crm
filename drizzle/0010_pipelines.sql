CREATE TYPE "public"."deal_status" AS ENUM('OPEN', 'WON', 'LOST');--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" "deal_status" DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "stage_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "status" "deal_status" DEFAULT 'OPEN';--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_stages_pipeline_idx" ON "pipeline_stages" USING btree ("pipeline_id","position");--> statement-breakpoint
CREATE INDEX "pipelines_workspace_idx" ON "pipelines" USING btree ("workspace_id","position");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Hvert eksisterende firma får standard-pipelinen "Salg" med de fem faser, de kender i forvejen.
INSERT INTO "pipelines" ("workspace_id", "name", "position") SELECT "id", 'Salg', 0 FROM "workspaces";--> statement-breakpoint
INSERT INTO "pipeline_stages" ("workspace_id", "pipeline_id", "name", "position", "kind")
SELECT p."workspace_id", p."id", v.name, v.pos, v.kind::"deal_status"
FROM "pipelines" p
CROSS JOIN (VALUES ('Ny', 0, 'OPEN'), ('Kontaktet', 1, 'OPEN'), ('Tilbud sendt', 2, 'OPEN'), ('Vundet', 3, 'WON'), ('Tabt', 4, 'LOST')) AS v(name, pos, kind);--> statement-breakpoint
UPDATE "deals" d
SET "pipeline_id" = s."pipeline_id", "stage_id" = s."id", "status" = s."kind"
FROM "pipeline_stages" s
JOIN (VALUES ('NEW', 'Ny'), ('CONTACTED', 'Kontaktet'), ('PROPOSAL', 'Tilbud sendt'), ('WON', 'Vundet'), ('LOST', 'Tabt')) AS m(legacy, name) ON m.name = s."name"
WHERE s."workspace_id" = d."workspace_id" AND m.legacy = d."stage"::text;
