import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { isEncryptionConfigured } from "@/lib/crypto";
import { economicConfigured, installationUrl } from "@/lib/economic";
import { ECONOMIC_STATE_COOKIE } from "@/lib/economic-oauth";
import { getAppUrl } from "@/lib/url";

/** Sender en administrator til e-conomic for at give Kundespor adgang til firmaets regnskab. */
export async function GET() {
  const { workspace } = await requireRole("ADMIN");
  if (!economicConfigured() || !isEncryptionConfigured()) redirect("/indstillinger/regnskab?fejl=opsaetning");
  const nonce = randomBytes(18).toString("base64url");
  (await cookies()).set(ECONOMIC_STATE_COOKIE, `${nonce}.${workspace.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/economic",
    maxAge: 900,
  });
  redirect(installationUrl(`${await getAppUrl()}/api/economic/callback`));
}
