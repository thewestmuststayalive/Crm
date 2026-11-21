import { eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import {
  connectAdAccount,
  connectPage,
  disconnectAdAccount,
  disconnectMeta,
  disconnectPage,
  importHistory,
  setLeadsAssignee,
  syncAdsNow,
} from "@/app/actions/meta";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/display";
import { buttonClass } from "@/components/styles";
import { Button, Card, ConfirmButton, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { getMemberOptions } from "@/lib/crm";
import { isEncryptionConfigured } from "@/lib/crypto";
import { formatDateTime } from "@/lib/labels";
import { getMetaConfig, graphGetAll } from "@/lib/meta/graph";
import { getConnection, userToken, type FbAdAccount, type FbPage } from "@/lib/meta/store";
import { hasRole } from "@/lib/roles";
import { getAppUrl } from "@/lib/url";

export const metadata: Metadata = { title: "Meta" };

const ERRORS: Record<string, string> = {
  opsaetning: "Meta er ikke sat op på serveren endnu (nøgler mangler).",
  afbrudt: "Forbindelsen blev afbrudt eller udløb. Prøv igen.",
  token: "Facebook afviste forbindelsen. Prøv igen, og sørg for at give alle tilladelser.",
};

export default async function MetaSettingsPage({ searchParams }: PageProps<"/indstillinger/meta">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const config = getMetaConfig();
  const appUrl = await getAppUrl();
  const message = typeof sp.besked === "string" ? sp.besked : null;
  const error =
    typeof sp.fejlbesked === "string" ? sp.fejlbesked : typeof sp.fejl === "string" ? (ERRORS[sp.fejl] ?? null) : null;

  const banner = (
    <>
      {message && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {sp.forbundet === "1" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Facebook er forbundet. Vælg nu hvilke sider og annoncekonti, der hører til dette firma.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </>
  );

  if (!config || !isEncryptionConfigured()) {
    return (
      <div className="space-y-6">
        {banner}
        <Card title="Meta er ikke sat op endnu">
          <p className="text-sm text-slate-600">
            For at forbinde Facebook og Instagram skal serveren have nøglerne fra din Meta-app:{" "}
            <code>META_APP_ID</code>, <code>META_APP_SECRET</code>, <code>META_VERIFY_TOKEN</code> og{" "}
            <code>ENCRYPTION_KEY</code>. Se guiden i <code>docs/meta-opsaetning.md</code>.
          </p>
        </Card>
      </div>
    );
  }

  const connection = await getConnection(workspace.id);
  const [pages, adAccounts, members] = await Promise.all([
    db.select().from(schema.metaPages).where(eq(schema.metaPages.workspaceId, workspace.id)),
    db.select().from(schema.metaAdAccounts).where(eq(schema.metaAdAccounts.workspaceId, workspace.id)),
    getMemberOptions(workspace.id),
  ]);

  // Hent hvilke sider og annoncekonti brugeren har adgang til hos Meta.
  let available: FbPage[] = [];
  let availableAccounts: FbAdAccount[] = [];
  let fetchError: string | null = null;
  const takenPageIds = new Set<string>();
  const takenAccountIds = new Set<string>();
  if (connection && isAdmin) {
    try {
      const token = userToken(connection);
      [available, availableAccounts] = await Promise.all([
        graphGetAll<FbPage>("me/accounts", token, { fields: "id,name,instagram_business_account{id,username}" }),
        graphGetAll<FbAdAccount>("me/adaccounts", token, { fields: "account_id,name,currency" }),
      ]);
      const ids = available.map((p) => p.id);
      if (ids.length) {
        for (const r of await db
          .select({ pageId: schema.metaPages.pageId })
          .from(schema.metaPages)
          .where(inArray(schema.metaPages.pageId, ids)))
          takenPageIds.add(r.pageId);
      }
      const accIds = availableAccounts.map((a) => a.account_id);
      if (accIds.length) {
        for (const r of await db
          .select({ id: schema.metaAdAccounts.adAccountId })
          .from(schema.metaAdAccounts)
          .where(inArray(schema.metaAdAccounts.adAccountId, accIds)))
          takenAccountIds.add(r.id);
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "Ukendt fejl";
    }
  }

  const webhookUrl = `${appUrl}/api/meta/webhook`;

  return (
    <div className="space-y-6">
      {banner}

      <Card title="Facebook-forbindelse">
        {connection ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-slate-700">
              Forbundet som <span className="font-medium">{connection.fbUserName ?? connection.fbUserId}</span>
              {connection.tokenExpiresAt && (
                <span className="text-slate-500"> · adgang udløber {formatDateTime(connection.tokenExpiresAt)}</span>
              )}
            </p>
            {isAdmin && (
              <div className="flex gap-2">
                <a href="/api/meta/connect" className={buttonClass("secondary")}>
                  Forbind igen
                </a>
                <form action={disconnectMeta}>
                  <ConfirmButton message="Frakobl Facebook? Sider, annoncekonti og samtaler fjernes fra dette firma.">
                    Frakobl
                  </ConfirmButton>
                </form>
              </div>
            )}
          </div>
        ) : isAdmin ? (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              Log ind med den Facebook-konto, der administrerer firmaets side og annoncekonto. Du vælger bagefter, hvilke
              sider og konti der hører til <span className="font-medium">{workspace.name}</span>.
            </p>
            <a href="/api/meta/connect" className={buttonClass()}>
              Forbind med Facebook
            </a>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Bed en administrator om at forbinde Facebook.</p>
        )}
        {fetchError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Kunne ikke hente dine sider fra Meta: {fetchError}. Prøv at forbinde igen.
          </p>
        )}
      </Card>

      <Card title="Sider (leads og beskeder)" description="Leads fra Lead Ads og beskeder fra Messenger/Instagram hentes fra disse sider.">
        {pages.length === 0 && <p className="text-sm text-slate-500">Ingen sider koblet på endnu.</p>}
        <ul className="divide-y divide-slate-100">
          {pages.map((p) => (
            <li key={p.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">
                  {p.name}{" "}
                  {p.igUsername && <Badge className="ml-1 bg-pink-50 text-pink-800">Instagram @{p.igUsername}</Badge>}
                </p>
                {isAdmin && (
                  <div className="flex gap-2">
                    <form action={importHistory}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button variant="secondary" type="submit" className="px-2.5 py-1 text-xs">
                        Hent beskeder
                      </Button>
                    </form>
                    <form action={disconnectPage}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton message={`Frakobl ${p.name}? Samtaler fra siden slettes fra CRM'et.`} className="px-2.5 py-1 text-xs">
                        Frakobl
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </div>
              {isAdmin && (
                <form action={setLeadsAssignee} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="id" value={p.id} />
                  <label htmlFor={`assignee-${p.id}`} className="text-slate-600">
                    Nye leads tildeles
                  </label>
                  <Select id={`assignee-${p.id}`} name="assigneeId" defaultValue={p.leadsAssigneeId ?? ""}>
                    <option value="">Ingen</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" type="submit" className="px-2.5 py-1 text-xs">
                    Gem
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && connection && available.filter((p) => !takenPageIds.has(p.id)).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700">Tilgængelige sider</p>
            <ul className="mt-2 space-y-2">
              {available
                .filter((p) => !takenPageIds.has(p.id))
                .map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {p.name}
                      {p.instagram_business_account?.username && (
                        <span className="text-slate-500"> · Instagram @{p.instagram_business_account.username}</span>
                      )}
                    </span>
                    <form action={connectPage}>
                      <input type="hidden" name="pageId" value={p.id} />
                      <Button type="submit" className="px-2.5 py-1 text-xs">
                        Kobl til {workspace.name}
                      </Button>
                    </form>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Annoncekonti" description="Forbrug pr. kampagne hentes dagligt og vises under Annoncer.">
        {adAccounts.length === 0 && <p className="text-sm text-slate-500">Ingen annoncekonti koblet på endnu.</p>}
        <ul className="divide-y divide-slate-100">
          {adAccounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>
                <span className="font-medium text-slate-900">{a.name}</span>{" "}
                <span className="text-slate-500">
                  ({a.currency}) · {a.lastSyncedAt ? `opdateret ${formatDateTime(a.lastSyncedAt)}` : "ikke hentet endnu"}
                </span>
              </span>
              {isAdmin && (
                <form action={disconnectAdAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmButton message={`Frakobl ${a.name}?`} className="px-2.5 py-1 text-xs">
                    Frakobl
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && adAccounts.length > 0 && (
          <form action={syncAdsNow} className="mt-3">
            <Button variant="secondary" type="submit">
              Opdatér annoncedata nu
            </Button>
          </form>
        )}
        {isAdmin && connection && availableAccounts.filter((a) => !takenAccountIds.has(a.account_id)).length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-700">Tilgængelige annoncekonti</p>
            <ul className="mt-2 space-y-2">
              {availableAccounts
                .filter((a) => !takenAccountIds.has(a.account_id))
                .map((a) => (
                  <li key={a.account_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {a.name} <span className="text-slate-500">({a.currency ?? "DKK"})</span>
                    </span>
                    <form action={connectAdAccount}>
                      <input type="hidden" name="accountId" value={a.account_id} />
                      <Button type="submit" className="px-2.5 py-1 text-xs">
                        Kobl til {workspace.name}
                      </Button>
                    </form>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Card>

      {isAdmin && (
        <Card title="Til opsætning af Meta-appen" description="Disse værdier skal indtastes i Meta for Developers under Webhooks.">
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-slate-500">Callback-URL:</dt>
              <dd className="break-all font-mono text-xs">{webhookUrl}</dd>
              <CopyButton text={webhookUrl} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-slate-500">Verify token:</dt>
              <dd className="text-slate-700">værdien af META_VERIFY_TOKEN på serveren</dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-slate-500">Login-redirect:</dt>
              <dd className="break-all font-mono text-xs">{appUrl}/api/meta/callback</dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
