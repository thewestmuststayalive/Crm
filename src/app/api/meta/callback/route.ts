import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { graph, requireMetaConfig } from "@/lib/meta/graph";
import { OAUTH_STATE_COOKIE } from "@/lib/meta/oauth";
import { getAppUrl } from "@/lib/url";

type TokenResponse = { access_token: string; expires_in?: number };

/** Facebook sender brugeren hertil efter login. Vi bytter koden til et langtidsholdbart token. */
export async function GET(request: NextRequest) {
  const { user, workspace } = await requireRole("ADMIN");
  const store = await cookies();
  const saved = store.get(OAUTH_STATE_COOKIE)?.value ?? "";
  store.delete({ name: OAUTH_STATE_COOKIE, path: "/api/meta" });

  const params = request.nextUrl.searchParams;
  const [savedState, savedWorkspace] = saved.split(".");
  const state = params.get("state") ?? "";
  const stateOk =
    savedState &&
    state.length === savedState.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(savedState)) &&
    savedWorkspace === workspace.id;
  const code = params.get("code");
  if (!stateOk || !code) redirect("/indstillinger/meta?fejl=afbrudt");

  const config = requireMetaConfig();
  const redirectUri = `${await getAppUrl()}/api/meta/callback`;
  let failed = false;
  try {
    const short = await graph.get<TokenResponse>("oauth/access_token", null, {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const long = await graph.get<TokenResponse>("oauth/access_token", null, {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: short.access_token,
    });
    const me = await graph.get<{ id: string; name?: string }>("me", long.access_token, { fields: "id,name" });

    const values = {
      fbUserId: me.id,
      fbUserName: me.name ?? null,
      userTokenEnc: encrypt(long.access_token),
      tokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
      connectedById: user.id,
    };
    await db
      .insert(schema.metaConnections)
      .values({ workspaceId: workspace.id, ...values })
      .onConflictDoUpdate({ target: schema.metaConnections.workspaceId, set: values });
  } catch (error) {
    console.error("Meta-forbindelse fejlede", error);
    failed = true;
  }
  redirect(failed ? "/indstillinger/meta?fejl=token" : "/indstillinger/meta?forbundet=1");
}
