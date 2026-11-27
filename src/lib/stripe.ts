import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "./crypto";

// Betaling med kort og MobilePay via Stripe Checkout. Hvert firma har sin egen Stripe-konto;
// den hemmelige nøgle sættes ind under Indstillinger → Betaling og gemmes krypteret.
// Kundespor opretter selv en webhook hos Stripe, så betalinger registreres automatisk.
// Betalingsmetoder (kort, MobilePay, Apple Pay …) styres i Stripes dashboard.
// STRIPE_API_URL bruges kun i tests.

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

const apiBase = () => (process.env.STRIPE_API_URL ?? "https://api.stripe.com").replace(/\/$/, "");

/** Stripe-nøgler: hemmelig (sk_) eller begrænset (rk_), test eller live. */
export function looksLikeStripeKey(key: string) {
  return /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,200}$/.test(key);
}

/** Stripe forventer formular-kodning med indlejrede nøgler, fx line_items[0][quantity]=1. */
export function formEncode(data: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === "object") out.push(...formEncode(v as Record<string, unknown>, `${name}[${i}]`));
        else out.push(`${encodeURIComponent(`${name}[]`)}=${encodeURIComponent(String(v))}`);
      });
    } else if (typeof value === "object") {
      out.push(...formEncode(value as Record<string, unknown>, name));
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

async function call<T>(secretKey: string, method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: body ? formEncode(body).join("&") : undefined,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new StripeError("Stripe svarede ikke. Prøv igen om lidt.");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    console.error("Stripe fejl", method, path, res.status, err?.error?.message);
    if (res.status === 401) throw new StripeError("Stripe afviste nøglen. Tjek at den er kopieret korrekt.", 401);
    if (res.status === 403) throw new StripeError("Nøglen mangler rettigheder hos Stripe.", 403);
    throw new StripeError(err?.error?.message ? `Stripe svarede: ${err.error.message}` : "Stripe svarede med en fejl.", res.status);
  }
  return (await res.json()) as T;
}

export async function getStripeAccount(secretKey: string) {
  const a = await call<{
    id: string;
    settings?: { dashboard?: { display_name?: string } };
    business_profile?: { name?: string };
  }>(secretKey, "GET", "/v1/account");
  return { id: a.id, name: a.settings?.dashboard?.display_name ?? a.business_profile?.name ?? null };
}

export const WEBHOOK_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];

export async function createWebhookEndpoint(secretKey: string, url: string) {
  return call<{ id: string; secret: string; livemode: boolean }>(secretKey, "POST", "/v1/webhook_endpoints", {
    url,
    enabled_events: WEBHOOK_EVENTS,
    description: "Kundespor – betalinger",
  });
}

export async function deleteWebhookEndpoint(secretKey: string, id: string) {
  await call(secretKey, "DELETE", `/v1/webhook_endpoints/${encodeURIComponent(id)}`);
}

export type StripeConnection = {
  secretKey: string;
  webhookSecret: string | null;
  accountName: string | null;
  livemode: boolean;
  webhookEndpointId: string | null;
};

export async function getStripeConnection(workspaceId: string): Promise<StripeConnection | null> {
  const [row] = await db
    .select()
    .from(schema.stripeConnections)
    .where(eq(schema.stripeConnections.workspaceId, workspaceId))
    .limit(1);
  if (!row) return null;
  return {
    secretKey: decrypt(row.secretKeyEnc),
    webhookSecret: row.webhookSecretEnc ? decrypt(row.webhookSecretEnc) : null,
    accountName: row.accountName,
    livemode: row.livemode,
    webhookEndpointId: row.webhookEndpointId,
  };
}

export type PaymentKind = "invoice" | "deposit";

export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: string | null;
  amount_total: number | null;
  metadata: Record<string, string>;
};

/** Opretter en betalingsside hos Stripe for et beløb i øre (DKK). */
export async function createCheckoutSession(
  conn: StripeConnection,
  input: {
    kind: PaymentKind;
    id: string;
    workspaceId: string;
    amountOre: number;
    name: string;
    email: string | null;
    successUrl: string;
    cancelUrl: string;
  },
) {
  const metadata = { kind: input.kind, id: input.id, workspaceId: input.workspaceId };
  return call<CheckoutSession>(conn.secretKey, "POST", "/v1/checkout/sessions", {
    mode: "payment",
    locale: "da",
    line_items: [
      {
        quantity: 1,
        price_data: { currency: "dkk", unit_amount: input.amountOre, product_data: { name: input.name.slice(0, 250) } },
      },
    ],
    ...(input.email ? { customer_email: input.email } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    payment_intent_data: { metadata },
  });
}

export async function getCheckoutSession(conn: StripeConnection, sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return null;
  return call<CheckoutSession>(conn.secretKey, "GET", `/v1/checkout/sessions/${sessionId}`);
}

/**
 * Tjekker Stripes signatur på en webhook (header "Stripe-Signature: t=…,v1=…").
 * Afviser beskeder, der er mere end 5 minutter gamle.
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return signatures.some(
    (sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
  );
}
