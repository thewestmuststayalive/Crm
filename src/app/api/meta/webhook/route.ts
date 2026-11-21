import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getMetaConfig } from "@/lib/meta/graph";
import { handleMessagingEvent } from "@/lib/meta/inbox";
import { handleLeadgen } from "@/lib/meta/leads";

// Webhook som Meta kalder ved nye leads (Lead Ads) og beskeder (Messenger/Instagram).
// Indstilles i Meta-appen under Webhooks med adressen <APP_URL>/api/meta/webhook.

/** Meta bekræfter webhooken med et GET-kald, der skal svare med hub.challenge. */
export function GET(request: NextRequest) {
  const config = getMetaConfig();
  const p = request.nextUrl.searchParams;
  if (config && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === config.verifyToken) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"), "hex");
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type WebhookBody = {
  object?: string;
  entry?: {
    id: string;
    changes?: { field: string; value: Record<string, string> }[];
    messaging?: Parameters<typeof handleMessagingEvent>[2][];
  }[];
};

export async function POST(request: NextRequest) {
  const config = getMetaConfig();
  if (!config) return new Response("Meta er ikke sat op", { status: 503 });

  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return new Response("Ugyldig signatur", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Ugyldig JSON", { status: 400 });
  }

  let failed = false;
  for (const entry of body.entry ?? []) {
    const tasks: Promise<unknown>[] = [];
    if (body.object === "page") {
      for (const change of entry.changes ?? []) {
        if (change.field === "leadgen") tasks.push(handleLeadgen(change.value));
      }
      for (const event of entry.messaging ?? []) tasks.push(handleMessagingEvent("MESSENGER", entry.id, event));
    } else if (body.object === "instagram") {
      for (const event of entry.messaging ?? []) tasks.push(handleMessagingEvent("INSTAGRAM", entry.id, event));
    }
    for (const result of await Promise.allSettled(tasks)) {
      if (result.status === "rejected") {
        failed = true;
        console.error("Meta-webhook fejlede", result.reason);
      }
    }
  }

  // Ved fejl svarer vi 500, så Meta prøver igen. Alt er idempotent (lead-id og besked-id er unikke).
  return new Response(failed ? "Fejl" : "EVENT_RECEIVED", { status: failed ? 500 : 200 });
}
