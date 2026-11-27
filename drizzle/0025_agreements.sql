CREATE TYPE "public"."agreement_interval" AS ENUM('WEEK', 'MONTH');--> statement-breakpoint
CREATE TYPE "public"."agreement_invoice_mode" AS ENUM('NONE', 'DRAFT', 'SEND');--> statement-breakpoint
CREATE TYPE "public"."agreement_status" AS ENUM('ACTIVE', 'PAUSED', 'ENDED');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'AGREEMENT_ALERT';--> statement-breakpoint
CREATE TABLE "agreement_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"period_date" date NOT NULL,
	"booking_id" uuid,
	"invoice_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"name" text NOT NULL,
	"status" "agreement_status" DEFAULT 'ACTIVE' NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interval" "agreement_interval" DEFAULT 'MONTH' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"next_date" date NOT NULL,
	"end_date" date,
	"season_months" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_adjust_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"price_adjust_month" integer,
	"last_adjusted_year" integer,
	"service_id" uuid,
	"booking_time" text,
	"invoice_mode" "agreement_invoice_mode" DEFAULT 'NONE' NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_runs" ADD CONSTRAINT "agreement_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_runs" ADD CONSTRAINT "agreement_runs_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_runs" ADD CONSTRAINT "agreement_runs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_runs" ADD CONSTRAINT "agreement_runs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_runs_period_idx" ON "agreement_runs" USING btree ("agreement_id","period_date");--> statement-breakpoint
CREATE INDEX "agreements_workspace_idx" ON "agreements" USING btree ("workspace_id","status","next_date");--> statement-breakpoint
CREATE INDEX "agreements_company_idx" ON "agreements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "agreements_contact_idx" ON "agreements" USING btree ("contact_id");