"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { isMemberOf } from "@/lib/crm";
import { encrypt } from "@/lib/crypto";
import { graph, graphGetAll } from "@/lib/meta/graph";
import { importConversations } from "@/lib/meta/inbox";
import { syncInsights } from "@/lib/meta/insights";
import {
  getConnection,
  getWorkspacePage,
  pageToken,
  userToken,
  type FbAdAccount,
  type FbPage,
} from "@/lib/meta/store";
import { isUuid } from "@/lib/validation";

const PATH = "/indstillinger/meta";
const SUBSCRIBED_FIELDS = "leadgen,messages,messaging_postbacks,message_echoes";


function done(message: string, kind: "ok" | "fejl" = "ok"): never {
  revalidatePath(PATH);
  redirect(`${PATH}?${kind === "ok" ? "besked" : "fejlbesked"}=${encodeURIComponent(message)}`);
}

async function requireConnection() {
  const ctx = await requireRole("ADMIN");
  const connection = await getConnection(ctx.workspace.id);
  if (!connection) done("Forbind først med Facebook.", "fejl");
  return { ...ctx, connection, token: userToken(connection) };
}

export async function connectPage(formData: FormData) {
  const { workspace, token } = await requireConnection();
  const pageId = String(formData.get("pageId") ?? "");

  const [existing] = await db
    .select({ workspaceId: schema.metaPages.workspaceId })
    .from(schema.metaPages)
    .where(eq(schema.metaPages.pageId, pageId))
    .limit(1);
  if (existing) done("Siden er allerede koblet til et firma. En side kan kun høre til ét firma.", "fejl");

  let fbPage: FbPage | undefined;
  try {
    const pages = await graphGetAll<FbPage>("me/accounts", token, {
      fields: "id,name,access_token,instagram_business_account{id,username}",
    });
    fbPage = pages.find((p) => p.id === pageId);
    if (fbPage) {
      await graph.post(`${pageId}/subscribed_apps`, fbPage.access_token, undefined, {
        subscribed_fields: SUBSCRIBED_FIELDS,
      });
    }
  } catch (error) {
    done(`Meta afviste forespørgslen: ${error instanceof Error ? error.message : "ukendt fejl"}`, "fejl");
  }
  if (!fbPage) done("Siden blev ikke fundet på din Facebook-konto.", "fejl");

  const [page] = await db
    .insert(schema.metaPages)
    .values({
      workspaceId: workspace.id,
      pageId,
      name: fbPage.name,
      pageTokenEnc: encrypt(fbPage.access_token),
      igAccountId: fbPage.instagram_business_account?.id ?? null,
      igUsername: fbPage.instagram_business_account?.username ?? null,
      subscribedAt: new Date(),
    })
    .returning();

  // Hent de seneste samtaler, så indbakken ikke starter tom. Fejl her er ikke kritiske.
  let imported = 0;
  try {
    imported += await importConversations(page, "MESSENGER");
    if (page.igAccountId) imported += await importConversations(page, "INSTAGRAM");
  } catch (error) {
    console.error("Import af samtaler fejlede", error);
  }
  done(`${fbPage.name} er koblet på. ${imported} samtaler hentet.`);
}

export async function disconnectPage(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const page = await getWorkspacePage(workspace.id, id);
  if (!page) return;
  try {
    await graph.delete(`${page.pageId}/subscribed_apps`, pageToken(page));
  } catch {
    // Siden kan allerede være frakoblet hos Meta; vi fjerner den lokalt alligevel.
  }
  await db.delete(schema.metaPages).where(eq(schema.metaPages.id, page.id));
  done(`${page.name} er frakoblet.`);
}

export async function setLeadsAssignee(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  if (!isUuid(id)) return;
  if (assigneeId && !(await isMemberOf(workspace.id, assigneeId))) return;
  await db
    .update(schema.metaPages)
    .set({ leadsAssigneeId: assigneeId || null })
    .where(and(eq(schema.metaPages.workspaceId, workspace.id), eq(schema.metaPages.id, id)));
  done("Gemt.");
}

export async function importHistory(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const page = await getWorkspacePage(workspace.id, String(formData.get("id") ?? ""));
  if (!page) return;
  let count = 0;
  try {
    count += await importConversations(page, "MESSENGER");
    if (page.igAccountId) count += await importConversations(page, "INSTAGRAM");
  } catch (error) {
    done(`Kunne ikke hente samtaler: ${error instanceof Error ? error.message : "ukendt fejl"}`, "fejl");
  }
  done(`${count} samtaler hentet fra ${page.name}.`);
}

export async function connectAdAccount(formData: FormData) {
  const { workspace, token } = await requireConnection();
  const accountId = String(formData.get("accountId") ?? "");
  let account: FbAdAccount | undefined;
  try {
    const accounts = await graphGetAll<FbAdAccount>("me/adaccounts", token, { fields: "account_id,name,currency" });
    account = accounts.find((a) => a.account_id === accountId);
  } catch (error) {
    done(`Meta afviste forespørgslen: ${error instanceof Error ? error.message : "ukendt fejl"}`, "fejl");
  }
  if (!account) done("Annoncekontoen blev ikke fundet.", "fejl");
  const inserted = await db
    .insert(schema.metaAdAccounts)
    .values({
      workspaceId: workspace.id,
      adAccountId: account.account_id,
      name: account.name,
      currency: account.currency ?? "DKK",
    })
    .onConflictDoNothing()
    .returning({ id: schema.metaAdAccounts.id });
  if (inserted.length === 0) done("Annoncekontoen er allerede koblet til et firma.", "fejl");

  try {
    await syncInsights(workspace.id);
  } catch (error) {
    done(`Kontoen er koblet på, men annoncedata kunne ikke hentes: ${error instanceof Error ? error.message : ""}`, "fejl");
  }
  done(`${account.name} er koblet på, og annoncedata for de seneste 30 dage er hentet.`);
}

export async function disconnectAdAccount(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  const [account] = await db
    .delete(schema.metaAdAccounts)
    .where(and(eq(schema.metaAdAccounts.workspaceId, workspace.id), eq(schema.metaAdAccounts.id, id)))
    .returning();
  if (account) {
    await db
      .delete(schema.adInsights)
      .where(and(eq(schema.adInsights.workspaceId, workspace.id), eq(schema.adInsights.adAccountId, account.adAccountId)));
  }
  done("Annoncekontoen er frakoblet.");
}

export async function syncAdsNow() {
  const { workspace } = await requireRole("ADMIN");
  let rows = 0;
  try {
    rows = (await syncInsights(workspace.id)).rows;
  } catch (error) {
    done(`Kunne ikke hente annoncedata: ${error instanceof Error ? error.message : "ukendt fejl"}`, "fejl");
  }
  done(`Annoncedata opdateret (${rows} rækker).`);
}

export async function disconnectMeta() {
  const { workspace } = await requireRole("ADMIN");
  const pages = await db.select().from(schema.metaPages).where(eq(schema.metaPages.workspaceId, workspace.id));
  for (const page of pages) {
    try {
      await graph.delete(`${page.pageId}/subscribed_apps`, pageToken(page));
    } catch {
      // Bedste forsøg.
    }
  }
  await db.delete(schema.metaPages).where(eq(schema.metaPages.workspaceId, workspace.id));
  await db.delete(schema.metaAdAccounts).where(eq(schema.metaAdAccounts.workspaceId, workspace.id));
  await db.delete(schema.adInsights).where(eq(schema.adInsights.workspaceId, workspace.id));
  await db.delete(schema.metaConnections).where(eq(schema.metaConnections.workspaceId, workspace.id));
  done("Facebook er frakoblet. Samtaler fra de frakoblede sider er slettet fra CRM'et.");
}
