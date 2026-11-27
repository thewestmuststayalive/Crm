CREATE TABLE "stripe_connections" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"secret_key_enc" text NOT NULL,
	"webhook_endpoint_id" text,
	"webhook_secret_enc" text,
	"account_name" text,
	"livemode" boolean DEFAULT false NOT NULL,
	"connected_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_settings" ADD COLUMN "deposit_ore" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_ore" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_via" text;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;