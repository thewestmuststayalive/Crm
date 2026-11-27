CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ECONOMIC_DRAFT', 'BOOKED', 'PAID');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'INVOICE_PAID';--> statement-breakpoint
CREATE TABLE "economic_connections" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"grant_token_enc" text NOT NULL,
	"agreement_number" integer,
	"company_name" text,
	"plan_level" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"deal_id" uuid,
	"booking_id" uuid,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"heading" text,
	"email" text,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"economic_draft_number" integer,
	"economic_number" integer,
	"date" date,
	"due_date" date,
	"net_ore" integer,
	"vat_ore" integer,
	"gross_ore" integer,
	"remainder_ore" integer,
	"token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "economic_customer_number" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "economic_customer_number" integer;--> statement-breakpoint
ALTER TABLE "economic_connections" ADD CONSTRAINT "economic_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economic_connections" ADD CONSTRAINT "economic_connections_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_workspace_status_idx" ON "invoices" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_company_idx" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoices_contact_idx" ON "invoices" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "invoices_deal_idx" ON "invoices" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_number_idx" ON "invoices" USING btree ("workspace_id","economic_number");