"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { getContact, getDeal, logEvent } from "@/lib/crm";
import { brandedEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { formatOre, parseAmountOre, parseDanishNumber, quoteTotals } from "@/lib/quote-math";
import { getQuote, getQuoteLines, newQuoteToken, nextQuoteNumber } from "@/lib/quotes";
import { getAppUrl } from "@/lib/url";
import { isUuid } from "@/lib/validation";
import type { ActionState } from "./types";

const editorPath = (dealId: string, quoteId: string) => `/pipeline/${dealId}/tilbud/${quoteId}`;

/** Opretter en kladde til et nyt tilbud på dealen og åbner editoren. */
export async function createQuote(formData: FormData) {
  const { user, workspace } = await requireWorkspace();
  const deal = await getDeal(workspace.id, String(formData.get("dealId") ?? ""));
  if (!deal) return;
  const [ws] = await db
    .select({ terms: schema.workspaces.quoteTerms })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspace.id))
    .limit(1);
  const validUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  let quoteId = "";
  // Nummeret er unikt pr. firma; ved samtidig oprettelse prøves igen.
  for (let attempt = 0; attempt < 3 && !quoteId; attempt++) {
    try {
      const [quote] = await db
        .insert(schema.quotes)
        .values({
          workspaceId: workspace.id,
          dealId: deal.id,
          number: await nextQuoteNumber(workspace.id),
          title: deal.title,
          terms: ws?.terms ?? null,
          validUntil,
          token: newQuoteToken(),
          createdById: user.id,
        })
        .returning({ id: schema.quotes.id });
      quoteId = quote.id;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await db.insert(schema.quoteLines).values({
    workspaceId: workspace.id,
    quoteId,
    position: 0,
    description: deal.title,
    quantity: "1",
    unitPriceOre: deal.value * 100,
  });
  redirect(editorPath(deal.id, quoteId));
}

const lineSchema = z.object({
  description: z.string().trim().min(1, "Hver linje skal have en beskrivelse").max(500),
  quantity: z.string().trim().default("1"),
  unit: z.string().trim().max(20).default(""),
  unitPrice: z.string().trim().default("0"),
  discountPct: z.string().trim().default("0"),
});

const quoteSchema = z.object({
  title: z.string().trim().min(1, "Tilbuddet skal have en titel").max(200),
  intro: z.string().trim().max(5000).default(""),
  terms: z.string().trim().max(10000).default(""),
  validUntil: z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Ugyldig dato")
    .default(""),
  vatRate: z.union([z.literal(25), z.literal(0)]),
  lines: z.array(lineSchema).min(1, "Tilføj mindst én linje").max(100),
});

export type QuoteInput = z.input<typeof quoteSchema>;

export async function saveQuote(quoteId: string, input: QuoteInput): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const quote = await getQuote(workspace.id, quoteId);
  if (!quote) return { error: "Tilbuddet findes ikke" };
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") {
    return {
      error: "Tilbuddet er besvaret og kan ikke længere ændres. Opret et nyt tilbud.",
    };
  }
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const lines: (typeof schema.quoteLines.$inferInsert)[] = [];
  for (const [i, l] of parsed.data.lines.entries()) {
    const quantity = parseDanishNumber(l.quantity || "1");
    const discount = parseDanishNumber(l.discountPct || "0");
    const price = parseAmountOre(l.unitPrice);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000)
      return { error: `Linje ${i + 1}: ugyldigt antal` };
    if (!Number.isFinite(discount) || discount < 0 || discount > 100)
      return { error: `Linje ${i + 1}: rabat skal være 0–100 %` };
    if (price === null) return { error: `Linje ${i + 1}: ugyldig pris` };
    lines.push({
      workspaceId: workspace.id,
      quoteId: quote.id,
      position: i,
      description: l.description,
      quantity: String(Math.round(quantity * 100) / 100),
      unit: l.unit || null,
      unitPriceOre: price,
      discountPct: String(Math.round(discount * 100) / 100),
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.quotes)
      .set({
        title: parsed.data.title,
        intro: parsed.data.intro || null,
        terms: parsed.data.terms || null,
        validUntil: parsed.data.validUntil || null,
        vatRate: parsed.data.vatRate,
        updatedAt: new Date(),
      })
      .where(eq(schema.quotes.id, quote.id));
    await tx.delete(schema.quoteLines).where(eq(schema.quoteLines.quoteId, quote.id));
    await tx.insert(schema.quoteLines).values(lines);
  });
  revalidatePath(editorPath(quote.dealId, quote.id));
  revalidatePath(`/pipeline/${quote.dealId}`);
  return {
    success: quote.status === "SENT" ? "Gemt. Kunden ser den nye version via samme link." : "Gemt.",
  };
}

/** Markerer tilbuddet som sendt og sender det på e-mail til kontakten, hvis muligt. */
export async function sendQuote(quoteId: string): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const quote = await getQuote(workspace.id, quoteId);
  if (!quote) return { error: "Tilbuddet findes ikke" };
  if (quote.status === "ACCEPTED" || quote.status === "DECLINED") return { error: "Tilbuddet er allerede besvaret." };
  const deal = await getDeal(workspace.id, quote.dealId);
  if (!deal) return { error: "Dealen findes ikke" };
  const lines = await getQuoteLines(quote.id);
  if (lines.length === 0) return { error: "Tilføj mindst én linje først." };

  const url = `${await getAppUrl()}/tilbud/${quote.token}`;
  const contact = deal.contactId ? await getContact(workspace.id, deal.contactId) : null;
  let emailed = false;
  if (contact?.email && isEmailConfigured()) {
    const totals = quoteTotals(lines, quote.vatRate);
    const result = await sendEmail({
      to: contact.email,
      subject: `Tilbud #${quote.number} fra ${workspace.name}: ${quote.title}`,
      ...brandedEmail({
        sender: workspace.name,
        heading: `Hej ${contact.name.split(" ")[0]}`,
        paragraphs: [
          `Tak for din interesse. Her er vores tilbud på "${quote.title}" på ${formatOre(totals.total)} inkl. moms.`,
          "Du kan se hele tilbuddet og acceptere det online via knappen herunder.",
        ],
        button: { label: "Se tilbuddet", url },
        footer: `Sendt af ${workspace.name} via Kundespor.`,
      }),
    });
    emailed = result.sent;
  }

  await db
    .update(schema.quotes)
    .set({ status: "SENT", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.quotes.workspaceId, workspace.id), eq(schema.quotes.id, quote.id)));
  await logEvent(workspace.id, user.id, `Tilbud #${quote.number} sendt${emailed ? ` til ${contact?.email}` : ""}`, {
    dealId: deal.id,
    contactId: deal.contactId,
    companyId: deal.companyId,
  });
  revalidatePath(editorPath(deal.id, quote.id));
  revalidatePath(`/pipeline/${deal.id}`);
  return {
    success: emailed
      ? `Tilbuddet er sendt til ${contact?.email}.`
      : "Tilbuddet er klar. Kopiér linket og send det til kunden.",
  };
}

export async function deleteQuote(formData: FormData) {
  const { workspace } = await requireRole("MEMBER");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const quote = await getQuote(workspace.id, id);
  if (!quote) return;
  if (quote.status === "ACCEPTED") return; // Accepterede tilbud bevares som dokumentation.
  await db.delete(schema.quotes).where(eq(schema.quotes.id, quote.id));
  revalidatePath(`/pipeline/${quote.dealId}`);
  redirect(`/pipeline/${quote.dealId}`);
}
