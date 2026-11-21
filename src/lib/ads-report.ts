import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type CampaignRow = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  metaLeadCount: number;
  crmLeads: number;
  wonDeals: number;
  wonValue: number;
};

/**
 * Kampagner de seneste `days` dage: forbrug fra Meta, og hvad leadsene blev til i CRM'et
 * (leads importeret, deals vundet og deres værdi).
 */
export async function getCampaignReport(workspaceId: string, days: number) {
  const since = sql`(current_date - ${days}::int)`;

  const spendRows = await db
    .select({
      campaignId: schema.adInsights.campaignId,
      campaignName: sql<string>`max(${schema.adInsights.campaignName})`,
      spend: sql<string>`coalesce(sum(${schema.adInsights.spend}), 0)`,
      impressions: sql<string>`coalesce(sum(${schema.adInsights.impressions}), 0)`,
      clicks: sql<string>`coalesce(sum(${schema.adInsights.clicks}), 0)`,
      metaLeadCount: sql<string>`coalesce(sum(${schema.adInsights.metaLeads}), 0)`,
    })
    .from(schema.adInsights)
    .where(and(eq(schema.adInsights.workspaceId, workspaceId), gte(schema.adInsights.date, since)))
    .groupBy(schema.adInsights.campaignId);

  const leadRows = await db
    .select({
      campaignId: schema.metaLeads.campaignId,
      campaignName: sql<string | null>`max(${schema.metaLeads.campaignName})`,
      crmLeads: sql<string>`count(*)`,
      wonDeals: sql<string>`count(${schema.deals.id}) filter (where ${schema.deals.status} = 'WON')`,
      wonValue: sql<string>`coalesce(sum(${schema.deals.value}) filter (where ${schema.deals.status} = 'WON'), 0)`,
    })
    .from(schema.metaLeads)
    .leftJoin(schema.deals, eq(schema.deals.id, schema.metaLeads.dealId))
    .where(and(eq(schema.metaLeads.workspaceId, workspaceId), gte(schema.metaLeads.createdAt, since)))
    .groupBy(schema.metaLeads.campaignId);

  const byId = new Map<string, CampaignRow>();
  const get = (id: string, name: string) => {
    let row = byId.get(id);
    if (!row) {
      row = { campaignId: id, campaignName: name, spend: 0, impressions: 0, clicks: 0, metaLeadCount: 0, crmLeads: 0, wonDeals: 0, wonValue: 0 };
      byId.set(id, row);
    }
    return row;
  };
  for (const r of spendRows) {
    Object.assign(get(r.campaignId, r.campaignName), {
      spend: Number(r.spend),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      metaLeadCount: Number(r.metaLeadCount),
    });
  }
  for (const r of leadRows) {
    const row = get(r.campaignId ?? "ukendt", r.campaignName ?? "Ukendt kampagne");
    row.crmLeads = Number(r.crmLeads);
    row.wonDeals = Number(r.wonDeals);
    row.wonValue = Number(r.wonValue);
  }

  const rows = [...byId.values()].sort((a, b) => b.spend - a.spend || b.crmLeads - a.crmLeads);
  const totals = rows.reduce(
    (t, r) => ({
      spend: t.spend + r.spend,
      crmLeads: t.crmLeads + r.crmLeads,
      wonDeals: t.wonDeals + r.wonDeals,
      wonValue: t.wonValue + r.wonValue,
      clicks: t.clicks + r.clicks,
    }),
    { spend: 0, crmLeads: 0, wonDeals: 0, wonValue: 0, clicks: 0 },
  );
  return { rows, totals };
}
