import { createHash } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { ingestLead } from "@/lib/leads";

// Offentligt endpoint, som kontaktformularer på dine hjemmesider sender til.
// Nøglen i URL'en bestemmer hvilket firma (workspace) henvendelsen lander i.

const MAX_BODY_BYTES = 20_000;
const RATE_LIMIT = { max: 5, windowMinutes: 10 };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const leadSchema = z
  .object({
    name: text(200),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.email("Ugyldig e-mail").nullable()),
    phone: text(50),
    company: text(200),
    message: text(4000),
  })
  .refine((d) => d.email || d.phone, { message: "Angiv e-mail eller telefon" });

type Wants = "json" | "html";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function respond(wants: Wants, status: number, message: string, redirectUrl?: string | null) {
  if (wants === "html" && status < 300 && redirectUrl) {
    return new Response(null, { status: 303, headers: { Location: redirectUrl, ...CORS } });
  }
  if (wants === "json") {
    return Response.json({ ok: status < 300, message }, { status, headers: CORS });
  }
  const html = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${
    status < 300 ? "Tak" : "Fejl"
  }</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111827"><h1 style="font-size:1.5rem">${
    status < 300 ? "Tak for din henvendelse" : "Henvendelsen kunne ikke sendes"
  }</h1><p>${escapeHtml(message)}</p><p><a href="javascript:history.back()">Tilbage</a></p></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
}

/** Læser både almindelige HTML-formularer og JSON (fx fra fetch). Accepterer også danske feltnavne. */
async function readBody(request: NextRequest): Promise<Record<string, string>> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new Error("too_large");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("too_large");
  const type = request.headers.get("content-type") ?? "";
  let entries: Record<string, unknown>;
  if (type.includes("application/json")) {
    entries = JSON.parse(raw || "{}");
  } else if (type.includes("multipart/form-data")) {
    const form = await new Response(raw, { headers: { "content-type": type } }).formData();
    entries = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
  } else {
    entries = Object.fromEntries(new URLSearchParams(raw));
  }
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof entries[k] === "string") return entries[k] as string;
    return undefined;
  };
  return {
    name: pick("name", "navn") ?? "",
    email: pick("email", "e-mail", "mail") ?? "",
    phone: pick("phone", "telefon", "tlf") ?? "",
    company: pick("company", "firma", "virksomhed") ?? "",
    message: pick("message", "besked", "kommentar") ?? "",
    honeypot: pick("_hp") ?? "",
    page: pick("_page") ?? "",
    utmSource: pick("utm_source") ?? "",
    utmCampaign: pick("utm_campaign") ?? "",
  };
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/leads/[key]">) {
  const { key } = await ctx.params;
  const wants: Wants = (request.headers.get("accept") ?? "").includes("text/html") ? "html" : "json";

  const [form] = await db
    .select()
    .from(schema.leadForms)
    .where(and(eq(schema.leadForms.key, key), eq(schema.leadForms.active, true)))
    .limit(1);
  if (!form) return respond(wants, 404, "Formularen findes ikke.");

  let body: Record<string, string>;
  try {
    body = await readBody(request);
  } catch {
    return respond(wants, 400, "Henvendelsen er for stor eller har et ugyldigt format.");
  }

  // Spam-fælde: feltet _hp er skjult for mennesker, men bots udfylder det. Lad som om alt gik godt.
  if (body.honeypot) return respond(wants, 200, "Vi vender tilbage hurtigst muligt.", form.redirectUrl);

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "ukendt";
  const ipHash = createHash("sha256").update(`${form.workspaceId}:${ip}`).digest("hex");
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(schema.leadSubmissions)
    .where(
      and(
        eq(schema.leadSubmissions.ipHash, ipHash),
        gt(schema.leadSubmissions.createdAt, new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000)),
      ),
    );
  if (recent >= RATE_LIMIT.max) {
    return respond(wants, 429, "Der er sendt for mange henvendelser. Prøv igen om lidt.");
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) return respond(wants, 400, parsed.error.issues[0].message);
  const lead = parsed.data;
  const name = lead.name ?? lead.email ?? lead.phone ?? "Ukendt";

  const result = await ingestLead({
    workspaceId: form.workspaceId,
    source: "WEBSITE",
    channelLabel: `kontaktformularen "${form.name}"`,
    name,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.company,
    message: lead.message,
    extra: {
      Side: body.page.slice(0, 300),
      "UTM-kilde": body.utmSource.slice(0, 100),
      "UTM-kampagne": body.utmCampaign.slice(0, 100),
    },
    assigneeId: form.assigneeId,
    createDeal: form.createDeal,
  });

  await db.insert(schema.leadSubmissions).values({
    workspaceId: form.workspaceId,
    formId: form.id,
    contactId: result.contactId,
    ipHash,
    payload: { ...lead, page: body.page, utmSource: body.utmSource, utmCampaign: body.utmCampaign },
  });

  return respond(wants, 200, "Vi vender tilbage hurtigst muligt.", form.redirectUrl);
}
