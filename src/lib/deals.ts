import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { respondToContact } from "./awaiting";
import { logEvent } from "./crm";
import { formatKr } from "./labels";
import { notify } from "./notify";
import { getStage, type Stage } from "./pipelines";

type DealRow = typeof schema.deals.$inferSelect;

/**
 * Fælles logik når en deal skifter fase: opdaterer status og lukkedato, logger
 * hændelsen og gør kontakten til kunde, når en deal vindes.
 */
export async function onStageChange(deal: DealRow, newStage: Stage, userId: string | null) {
  if (deal.stageId === newStage.id) return;
  const oldStage = await getStage(deal.workspaceId, deal.stageId);
  const statusChanged = deal.status !== newStage.kind;

  await db
    .update(schema.deals)
    .set({
      pipelineId: newStage.pipelineId,
      stageId: newStage.id,
      status: newStage.kind,
      // Lukkedato sættes, når dealen vindes eller tabes, og nulstilles hvis den genåbnes.
      ...(statusChanged ? { closedAt: newStage.kind === "OPEN" ? null : new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.deals.workspaceId, deal.workspaceId), eq(schema.deals.id, deal.id)));

  await logEvent(
    deal.workspaceId,
    userId,
    `Deal "${deal.title}" flyttet fra ${oldStage?.name ?? "?"} til ${newStage.name}`,
    { dealId: deal.id, contactId: deal.contactId, companyId: deal.companyId },
  );

  if (newStage.kind === "WON" && deal.status !== "WON") {
    await notify({
      workspaceId: deal.workspaceId,
      to: "all",
      excludeUserId: userId,
      type: "DEAL_WON",
      title: `Deal vundet: ${deal.title}`,
      body: formatKr(deal.value),
      href: `/pipeline/${deal.id}`,
    });

    if (deal.contactId) {
      await db
        .update(schema.contacts)
        .set({ status: "CUSTOMER", updatedAt: new Date() })
        .where(
          and(
            eq(schema.contacts.workspaceId, deal.workspaceId),
            eq(schema.contacts.id, deal.contactId),
            eq(schema.contacts.status, "LEAD"),
          ),
        );
      await respondToContact(deal.workspaceId, deal.contactId, { log: false });
    }
  }
}

/** Læser et beløb som "12.500", "12500" eller "12.500,50" og runder til hele kroner. */
export function parseKroner(input: string): number | null {
  let cleaned = input.replace(/\s|kr\.?|dkk/gi, "");
  // "1250.50" (punktum som decimaltegn) vs. "12.500" (punktum som tusindtalsseparator)
  if (!cleaned.includes(",") && /^\d+\.\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(".", ",");
  }
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 2_000_000_000) return null;
  return Math.round(n);
}
