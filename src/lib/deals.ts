import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DealStage } from "@/db/schema";
import { logEvent } from "./crm";
import { STAGE_LABELS } from "./labels";

type DealRow = typeof schema.deals.$inferSelect;

/**
 * Fælles logik når en deal skifter fase: sætter/nulstiller lukkedato, logger
 * hændelsen og gør kontakten til kunde, når en deal vindes.
 */
export async function onStageChange(deal: DealRow, newStage: DealStage, userId: string) {
  if (deal.stage === newStage) return;
  const closed = newStage === "WON" || newStage === "LOST";

  await db
    .update(schema.deals)
    .set({ stage: newStage, closedAt: closed ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(schema.deals.workspaceId, deal.workspaceId), eq(schema.deals.id, deal.id)));

  await logEvent(
    deal.workspaceId,
    userId,
    `Deal "${deal.title}" flyttet fra ${STAGE_LABELS[deal.stage]} til ${STAGE_LABELS[newStage]}`,
    { dealId: deal.id, contactId: deal.contactId, companyId: deal.companyId },
  );

  if (newStage === "WON" && deal.contactId) {
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
