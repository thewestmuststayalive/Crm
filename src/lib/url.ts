import "server-only";
import { headers } from "next/headers";

/**
 * Appens offentlige adresse, fx https://crm.ditfirma.dk. Brug APP_URL i drift;
 * ellers udledes den af den aktuelle forespørgsel.
 */
export async function getAppUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
