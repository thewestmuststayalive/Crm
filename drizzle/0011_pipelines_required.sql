DROP INDEX "deals_workspace_stage_idx";--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "pipeline_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "stage_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "deals_workspace_status_idx" ON "deals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "deals_stage_idx" ON "deals" USING btree ("stage_id");--> statement-breakpoint
ALTER TABLE "deals" DROP COLUMN "stage";--> statement-breakpoint
DROP TYPE "public"."deal_stage";