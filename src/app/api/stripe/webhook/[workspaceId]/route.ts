import { applyPaidSession } from "@/lib/payments";
import { getStripeConnection, verifyStripeSignature, WEBHOOK_EVENTS, type CheckoutSession } from "@/lib/stripe";
import { isUuid } from "@/lib/validation";

/**
 * Stripe giver besked her, når en kunde har betalt. Adressen indeholder firmaets id, og
 * beskeden godkendes kun med netop det firmas hemmelige webhook-nøgle (signatur).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/stripe/webhook/[workspaceId]">) {
  const { workspaceId } = await params;
  if (!isUuid(workspaceId)) return new Response("Not found", { status: 404 });
  const conn = await getStripeConnection(workspaceId);
  if (!conn?.webhookSecret) return new Response("Not found", { status: 404 });
  const payload = await request.text();
  if (payload.length > 512_000) return new Response("Too large", { status: 413 });
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), conn.webhookSecret)) {
    return new Response("Invalid signature", { status: 400 });
  }
  let event: { type?: string; data?: { object?: CheckoutSession } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (event.type && WEBHOOK_EVENTS.includes(event.type) && event.data?.object) {
    await applyPaidSession(workspaceId, event.data.object);
  }
  return Response.json({ received: true });
}
