import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { graphGetAll } from "./graph";
import { getConnection, userToken } from "./store";

type InsightRow = {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
};

/** Henter annonceforbrug pr. kampagne pr. dag for de seneste 30 dage for alle firmaets annoncekonti. */
export async function syncInsights(workspaceId: string) {
  const connection = await getConnection(workspaceId);
  if (!connection) return { accounts: 0, rows: 0 };
  const token = userToken(connection);
  const accounts = await db
    .select()
    .from(schema.metaAdAccounts)
    .where(eq(schema.metaAdAccounts.workspaceId, workspaceId));

  let rows = 0;
  for (const account of accounts) {
    const data = await graphGetAll<InsightRow>(`act_${account.adAccountId}/insights`, token, {
      level: "campaign",
      time_increment: "1",
      date_preset: "last_30d",
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      limit: "500",
    });
    for (const r of data) {
      const leads = r.actions?.find((a) => a.action_type === "lead")?.value ?? "0";
      const values = {
        workspaceId,
        adAccountId: account.adAccountId,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        date: r.date_start,
        spend: r.spend ?? "0",
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        metaLeads: Number(leads),
      };
      await db
        .insert(schema.adInsights)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.adInsights.adAccountId, schema.adInsights.campaignId, schema.adInsights.date],
          set: {
            workspaceId,
            campaignName: values.campaignName,
            spend: values.spend,
            impressions: values.impressions,
            clicks: values.clicks,
            metaLeads: values.metaLeads,
          },
        });
      rows++;
    }
    await db
      .update(schema.metaAdAccounts)
      .set({ lastSyncedAt: sql`now()` })
      .where(eq(schema.metaAdAccounts.id, account.id));
  }
  return { accounts: accounts.length, rows };
}
