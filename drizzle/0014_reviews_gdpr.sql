CREATE TYPE "public"."review_request_status" AS ENUM('SCHEDULED', 'SENT', 'CLICKED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"deal_id" uuid,
	"status" "review_request_status" DEFAULT 'SCHEDULED' NOT NULL,
	"token" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "review_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "review_url" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "review_delay_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "review_message" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "lead_retention_months" integer;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_requests_due_idx" ON "review_requests" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX "review_requests_workspace_idx" ON "review_requests" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "review_requests_contact_idx" ON "review_requests" USING btree ("contact_id");