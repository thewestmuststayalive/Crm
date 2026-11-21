CREATE TYPE "public"."message_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."message_platform" AS ENUM('MESSENGER', 'INSTAGRAM');--> statement-breakpoint
CREATE TABLE "ad_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"date" date NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"meta_leads" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"meta_page_id" uuid NOT NULL,
	"platform" "message_platform" NOT NULL,
	"external_user_id" text NOT NULL,
	"name" text,
	"contact_id" uuid,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_inbound_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"text" text,
	"attachments" jsonb,
	"external_id" text,
	"sent_by_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "meta_ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ad_account_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'DKK' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_ad_accounts_ad_account_id_unique" UNIQUE("ad_account_id")
);
--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"fb_user_id" text NOT NULL,
	"fb_user_name" text,
	"user_token_enc" text NOT NULL,
	"token_expires_at" timestamp with time zone,
	"connected_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"leadgen_id" text NOT NULL,
	"page_id" text NOT NULL,
	"form_id" text,
	"ad_id" text,
	"campaign_id" text,
	"campaign_name" text,
	"contact_id" uuid,
	"deal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_leads_leadgen_id_unique" UNIQUE("leadgen_id")
);
--> statement-breakpoint
CREATE TABLE "meta_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"name" text NOT NULL,
	"page_token_enc" text NOT NULL,
	"ig_account_id" text,
	"ig_username" text,
	"leads_assignee_id" uuid,
	"subscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_pages_page_id_unique" UNIQUE("page_id")
);
--> statement-breakpoint
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_meta_page_id_meta_pages_id_fk" FOREIGN KEY ("meta_page_id") REFERENCES "public"."meta_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_connected_by_id_users_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_leads" ADD CONSTRAINT "meta_leads_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_pages" ADD CONSTRAINT "meta_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_pages" ADD CONSTRAINT "meta_pages_leads_assignee_id_users_id_fk" FOREIGN KEY ("leads_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_unique_idx" ON "ad_insights" USING btree ("ad_account_id","campaign_id","date");--> statement-breakpoint
CREATE INDEX "ad_insights_workspace_date_idx" ON "ad_insights" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_page_user_idx" ON "conversations" USING btree ("meta_page_id","platform","external_user_id");--> statement-breakpoint
CREATE INDEX "conversations_workspace_last_idx" ON "conversations" USING btree ("workspace_id","last_message_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "meta_ad_accounts_workspace_idx" ON "meta_ad_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "meta_leads_workspace_campaign_idx" ON "meta_leads" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
CREATE INDEX "meta_pages_workspace_idx" ON "meta_pages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "meta_pages_ig_idx" ON "meta_pages" USING btree ("ig_account_id");