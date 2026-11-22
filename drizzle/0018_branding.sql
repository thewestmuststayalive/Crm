ALTER TABLE "users" ADD COLUMN "muted_email_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "logo_data" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "email_texts" jsonb DEFAULT '{}'::jsonb NOT NULL;