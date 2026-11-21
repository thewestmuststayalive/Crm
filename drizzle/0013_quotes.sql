CREATE TYPE "public"."quote_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'QUOTE_VIEWED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'QUOTE_ACCEPTED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'QUOTE_DECLINED';--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit" text,
	"unit_price_ore" integer DEFAULT 0 NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"terms" text,
	"status" "quote_status" DEFAULT 'DRAFT' NOT NULL,
	"valid_until" date,
	"vat_rate" integer DEFAULT 25 NOT NULL,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_name" text,
	"accepted_ip_hash" text,
	"declined_at" timestamp with time zone,
	"decline_reason" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "cvr" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "quote_terms" text;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_lines_quote_idx" ON "quote_lines" USING btree ("quote_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_workspace_number_idx" ON "quotes" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "quotes_deal_idx" ON "quotes" USING btree ("deal_id");