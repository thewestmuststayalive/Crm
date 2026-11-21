CREATE TYPE "public"."automation_type" AS ENUM('STALE_LEAD', 'PROPOSAL_FOLLOWUP', 'CLOSE_DATE_PASSED');--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"workspace_id" uuid NOT NULL,
	"type" "automation_type" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"days" integer DEFAULT 3 NOT NULL,
	"last_run_at" timestamp with time zone,
	CONSTRAINT "automation_rules_workspace_id_type_pk" PRIMARY KEY("workspace_id","type")
);
--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;