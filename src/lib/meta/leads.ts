import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ingestLead } from "@/lib/leads";
import { graph } from "./graph";
import { findPageByExternalId, pageToken } from "./store";

type LeadgenChange = { leadgen_id?: string; page_id?: string; form_id?: string; ad_id?: string; campaign_id?: string };

type LeadDetails = {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
};

// Felter fra Metas standardspørgsmål, som vi mapper til kontaktens felter.
const NAME_FIELDS = ["full_name", "name", "fulde_navn"];
const EMAIL_FIELDS = ["email", "e-mail", "work_email"];
const PHONE_FIELDS = ["phone_number", "phone", "telefon"];
const COMPANY_FIELDS = ["company_name", "company", "firma"];

/** Henter et lead fra Meta Lead Ads og opretter det i CRM'et. Kaldes fra webhooken. */
export async function handleLeadgen(change: LeadgenChange) {
  if (!change.leadgen_id || !change.page_id) return;
  const page = await findPageByExternalId("page", change.page_id);
  if (!page) return; // Siden er ikke koblet til noget firma.

  // Reservér lead-id'et først, så samme lead aldrig behandles to gange (Meta sender gentagelser).
  const [reserved] = await db
    .insert(schema.metaLeads)
    .values({
      workspaceId: page.workspaceId,
      leadgenId: change.leadgen_id,
      pageId: change.page_id,
      formId: change.form_id ?? null,
      adId: change.ad_id ?? null,
      campaignId: change.campaign_id ?? null,
    })
    .onConflictDoNothing({ target: schema.metaLeads.leadgenId })
    .returning({ id: schema.metaLeads.id });
  if (!reserved) return;

  try {
    const lead = await graph.get<LeadDetails>(change.leadgen_id, pageToken(page), {
      fields: "created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id",
    });

    const fields = new Map((lead.field_data ?? []).map((f) => [f.name.toLowerCase(), (f.values ?? []).join(", ")]));
    const take = (names: string[]) => {
      for (const n of names) {
        const v = fields.get(n);
        if (v) {
          fields.delete(n);
          return v;
        }
      }
      return null;
    };
    const first = fields.get("first_name");
    const last = fields.get("last_name");
    let name = take(NAME_FIELDS);
    if (!name && (first || last)) {
      name = [first, last].filter(Boolean).join(" ");
      fields.delete("first_name");
      fields.delete("last_name");
    }
    const email = take(EMAIL_FIELDS);
    const phone = take(PHONE_FIELDS);
    const companyName = take(COMPANY_FIELDS);

    const extra: Record<string, string> = {};
    for (const [k, v] of fields) extra[k.replace(/_/g, " ")] = v;
    if (lead.campaign_name) extra.Kampagne = lead.campaign_name;
    if (lead.ad_name) extra.Annonce = lead.ad_name;

    const displayName = name ?? email ?? phone ?? "Meta-lead";
    const result = await ingestLead({
      workspaceId: page.workspaceId,
      source: "META_LEAD",
      channelLabel: lead.campaign_name ? `Meta Lead Ads (kampagne "${lead.campaign_name}")` : "Meta Lead Ads",
      name: displayName,
      email,
      phone,
      companyName,
      extra,
      assigneeId: page.leadsAssigneeId,
      createDeal: true,
      dealTitle: `Meta-lead: ${displayName}`,
    });

    await db
      .update(schema.metaLeads)
      .set({
        contactId: result.contactId,
        dealId: result.dealId,
        adId: lead.ad_id ?? change.ad_id ?? null,
        campaignId: lead.campaign_id ?? change.campaign_id ?? null,
        campaignName: lead.campaign_name ?? null,
        formId: lead.form_id ?? change.form_id ?? null,
      })
      .where(eq(schema.metaLeads.id, reserved.id));
  } catch (error) {
    // Frigiv reservationen, så Metas næste forsøg kan hente leadet.
    await db.delete(schema.metaLeads).where(eq(schema.metaLeads.id, reserved.id));
    throw error;
  }
}
