CREATE TYPE "public"."booking_source" AS ENUM('ONLINE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
ALTER TYPE "public"."lead_source" ADD VALUE 'BOOKING';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'NEW_BOOKING';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'BOOKING_CANCELLED';--> statement-breakpoint
CREATE TABLE "booking_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"opening_hours" jsonb NOT NULL,
	"slot_minutes" integer DEFAULT 30 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"max_days_ahead" integer DEFAULT 30 NOT NULL,
	"cancel_hours" integer DEFAULT 24 NOT NULL,
	"intro" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"service_id" uuid,
	"service_name" text NOT NULL,
	"price_ore" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'CONFIRMED' NOT NULL,
	"source" "booking_source" DEFAULT 'MANUAL' NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"assignee_id" uuid,
	"token" text NOT NULL,
	"ip_hash" text,
	"reminder_sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"price_ore" integer DEFAULT 0 NOT NULL,
	"reminder_months" integer,
	"bookable_online" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"plate" text,
	"make" text,
	"model" text,
	"year" integer,
	"color" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "booking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "agency_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_workspace_start_idx" ON "bookings" USING btree ("workspace_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_contact_idx" ON "bookings" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "bookings_status_start_idx" ON "bookings" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "services_workspace_idx" ON "services" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE INDEX "vehicles_workspace_plate_idx" ON "vehicles" USING btree ("workspace_id","plate");--> statement-breakpoint
CREATE INDEX "vehicles_contact_idx" ON "vehicles" USING btree ("contact_id");