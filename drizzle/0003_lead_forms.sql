CREATE TABLE "lead_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"redirect_url" text,
	"assignee_id" uuid,
	"create_deal" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_forms_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "lead_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"form_id" uuid,
	"contact_id" uuid,
	"ip_hash" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_form_id_lead_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."lead_forms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_forms_workspace_idx" ON "lead_forms" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "lead_submissions_form_idx" ON "lead_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_submissions_ip_idx" ON "lead_submissions" USING btree ("ip_hash","created_at");