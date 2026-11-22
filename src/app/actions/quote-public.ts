"use server";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db, schema } from "@/db";
import { logEvent } from "@/lib/crm";
import { onStageChange } from "@/lib/deals";
import { brandedEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { emailBrand } from "@/lib/branding";
import { todayIso } from "@/lib/labels";
import { notify } from "@/lib/notify";
import { getStageOfKind } from "@/lib/pipelines";
import { formatOre, quoteTotals } from "@/lib/quote-math";
import { getPublicQuote, isExpired, quoteResponders } from "@/lib/quotes";
import { getAppUrl } from "@/lib/url";
import type { ActionState } from "./types";

// Offentlige handlinger på tilbudssiden. Kunden er ikke logget ind: det hemmelige link
// (token på 192 bit) er adgangen, og kun tilbud med status "Sendt" kan besvares.

async function loadOpenQuote(formData: FormData) {
  const quote = await getPublicQuote(String(formData.get("token") ?? ""));
  if (!quote) return { error: "Tilbuddet findes ikke." } as const;
  if (quote.quote.status !== "SENT") return { error: "Tilbuddet er allerede besvaret." } as const;
  if (isExpired(quote.quote, todayIso())) {
    return {
      error: "Tilbuddet er udløbet. Kontakt os for et nyt tilbud.",
    } as const;
  }
  return { quote } as const;
}

async function ipHash(workspaceId: string) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "ukendt";
  return createHash("sha256").update(`${workspaceId}:${ip}`).digest("hex");
}

const acceptSchema = z.object({
  name: z.string().trim().min(2, "Skriv dit fulde navn for at acceptere").max(120),
  consent: z.literal("on", {
    message: "Sæt flueben for at bekræfte, at du accepterer tilbuddet",
  }),
});

export async function acceptQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loaded = await loadOpenQuote(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { quote: q } = loaded;
  const parsed = acceptSchema.safeParse({
    name: formData.get("name"),
    consent: formData.get("consent"),
  });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0].message,
      values: { name: String(formData.get("name") ?? "") },
    };

  // Betinget opdatering, så to samtidige svar ikke begge går igennem.
  const [updated] = await db
    .update(schema.quotes)
    .set({
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedName: parsed.data.name,
      acceptedIpHash: await ipHash(q.quote.workspaceId),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.quotes.id, q.quote.id), eq(schema.quotes.status, "SENT")))
    .returning({ id: schema.quotes.id });
  if (!updated) return { error: "Tilbuddet er allerede besvaret." };

  const totals = quoteTotals(q.lines, q.quote.vatRate);
  const deal = q.deal;
  await db
    .update(schema.deals)
    .set({ value: Math.round(totals.subtotal / 100), updatedAt: new Date() })
    .where(and(eq(schema.deals.workspaceId, deal.workspaceId), eq(schema.deals.id, deal.id)));
  await logEvent(
    deal.workspaceId,
    null,
    `Tilbud #${q.quote.number} accepteret online af ${parsed.data.name} (${formatOre(totals.total)} inkl. moms)`,
    { dealId: deal.id, contactId: deal.contactId, companyId: deal.companyId },
  );
  if (deal.status !== "WON") {
    const won = await getStageOfKind(deal.workspaceId, deal.pipelineId, "WON");
    if (won) await onStageChange({ ...deal, value: Math.round(totals.subtotal / 100) }, won, null);
  }

  await notify({
    workspaceId: deal.workspaceId,
    to: quoteResponders(deal, q.quote.createdById),
    type: "QUOTE_ACCEPTED",
    title: `Tilbud accepteret: ${q.quote.title}`,
    body: `${parsed.data.name} har accepteret tilbud #${q.quote.number} på ${formatOre(totals.total)} inkl. moms.`,
    href: `/pipeline/${deal.id}`,
    email: true,
  });

  if (q.contactEmail && isEmailConfigured()) {
    await sendEmail({
      to: q.contactEmail,
      subject: `Bekræftelse: tilbud #${q.quote.number} er accepteret`,
      ...brandedEmail({
        ...(await emailBrand(q.quote.workspaceId)),
        heading: "Tak for din accept",
        paragraphs: [
          `Vi har modtaget din accept af tilbuddet "${q.quote.title}" på ${formatOre(totals.total)} inkl. moms.`,
          `${q.seller.name} kontakter dig om det videre forløb.`,
        ],
        button: {
          label: "Se tilbuddet",
          url: `${await getAppUrl()}/tilbud/${q.quote.token}`,
        },
        footer: `Sendt af ${q.seller.name} via Kundespor.`,
      }),
    });
  }

  revalidatePath(`/tilbud/${q.quote.token}`);
  return { success: "Tak! Tilbuddet er accepteret." };
}

export async function declineQuote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loaded = await loadOpenQuote(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { quote: q } = loaded;
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 1000);

  const [updated] = await db
    .update(schema.quotes)
    .set({
      status: "DECLINED",
      declinedAt: new Date(),
      declineReason: reason || null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.quotes.id, q.quote.id), eq(schema.quotes.status, "SENT")))
    .returning({ id: schema.quotes.id });
  if (!updated) return { error: "Tilbuddet er allerede besvaret." };

  const deal = q.deal;
  await logEvent(deal.workspaceId, null, `Tilbud #${q.quote.number} afvist af kunden${reason ? `: "${reason}"` : ""}`, {
    dealId: deal.id,
    contactId: deal.contactId,
    companyId: deal.companyId,
  });
  await notify({
    workspaceId: deal.workspaceId,
    to: quoteResponders(deal, q.quote.createdById),
    type: "QUOTE_DECLINED",
    title: `Tilbud afvist: ${q.quote.title}`,
    body: reason ? `Begrundelse: ${reason}` : "Kunden gav ingen begrundelse.",
    href: `/pipeline/${deal.id}`,
    email: true,
  });

  revalidatePath(`/tilbud/${q.quote.token}`);
  return { success: "Tak for dit svar. Vi har givet besked videre." };
}
