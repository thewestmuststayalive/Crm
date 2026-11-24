CREATE TYPE "public"."prospect_source" AS ENUM('CVR', 'GOOGLE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('NEW', 'CALLED', 'CALL_BACK', 'INTERESTED', 'NOT_INTERESTED', 'CONVERTED');--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'PROSPECTING';--> statement-breakpoint
CREATE TABLE "lead_search_usage" (
	"workspace_id" uuid NOT NULL,
	"month" text NOT NULL,
	"google_requests" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lead_search_usage_workspace_id_month_pk" PRIMARY KEY("workspace_id","month")
);
--> statement-breakpoint
CREATE TABLE "prospect_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"source" "prospect_source" NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"cvr" text,
	"address" text,
	"phone" text,
	"website" text,
	"industry" text,
	"employees" text,
	"company_form" text,
	"founded_at" date,
	"rating" real,
	"review_count" integer,
	"maps_url" text,
	"status" "prospect_status" DEFAULT 'NEW' NOT NULL,
	"owner_id" uuid,
	"notes" text,
	"call_back_date" date,
	"last_contacted_at" timestamp with time zone,
	"website_check" jsonb,
	"website_checked_at" timestamp with time zone,
	"converted_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "lead_search_monthly_limit" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_search_usage" ADD CONSTRAINT "lead_search_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_lists" ADD CONSTRAINT "prospect_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_lists" ADD CONSTRAINT "prospect_lists_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_list_id_prospect_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."prospect_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_converted_company_id_companies_id_fk" FOREIGN KEY ("converted_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_lists_workspace_idx" ON "prospect_lists" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "prospects_list_idx" ON "prospects" USING btree ("list_id","status");--> statement-breakpoint
CREATE INDEX "prospects_workspace_updated_idx" ON "prospects" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_workspace_external_idx" ON "prospects" USING btree ("workspace_id","source","external_id");