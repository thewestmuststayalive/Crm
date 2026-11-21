import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";

export type MetaPage = typeof schema.metaPages.$inferSelect;

/** En side som Meta returnerer den fra /me/accounts. */
export type FbPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};
export type FbAdAccount = { id: string; account_id: string; name: string; currency?: string };

export async function getConnection(workspaceId: string) {
  const [row] = await db
    .select()
    .from(schema.metaConnections)
    .where(eq(schema.metaConnections.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export function userToken(connection: { userTokenEnc: string }) {
  return decrypt(connection.userTokenEnc);
}

export function pageToken(page: { pageTokenEnc: string }) {
  return decrypt(page.pageTokenEnc);
}

export async function getPagesForWorkspace(workspaceId: string) {
  return db.select().from(schema.metaPages).where(eq(schema.metaPages.workspaceId, workspaceId));
}

export async function getWorkspacePage(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.metaPages)
    .where(and(eq(schema.metaPages.workspaceId, workspaceId), eq(schema.metaPages.id, id)))
    .limit(1);
  return row ?? null;
}

/** Finder siden ud fra Metas id: side-id for Messenger/leads, Instagram-konto-id for Instagram. */
export async function findPageByExternalId(kind: "page" | "instagram", externalId: string) {
  const [row] = await db
    .select()
    .from(schema.metaPages)
    .where(kind === "page" ? eq(schema.metaPages.pageId, externalId) : eq(schema.metaPages.igAccountId, externalId))
    .limit(1);
  return row ?? null;
}
