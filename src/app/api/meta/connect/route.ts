import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { getMetaConfig } from "@/lib/meta/graph";
import { OAUTH_STATE_COOKIE } from "@/lib/meta/oauth";
import { getAppUrl } from "@/lib/url";

// Tilladelser CRM'et beder om. Lead Ads, beskeder og annoncedata kræver Metas godkendelse (App Review).
const SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_messaging",
  "leads_retrieval",
  "instagram_basic",
  "instagram_manage_messages",
  "ads_read",
  "business_management",
];

/** Sender en administrator videre til Facebook for at give CRM'et adgang. */
export async function GET() {
  const { workspace } = await requireRole("ADMIN");
  const config = getMetaConfig();
  if (!config || !isEncryptionConfigured()) redirect("/indstillinger/meta?fejl=opsaetning");

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(OAUTH_STATE_COOKIE, `${state}.${workspace.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/meta",
    maxAge: 600,
  });

  const oauthBase = (process.env.META_OAUTH_URL ?? "https://www.facebook.com").replace(/\/$/, "");
  const url = new URL(`${oauthBase}/${config.version}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", `${await getAppUrl()}/api/meta/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  redirect(url.toString());
}
