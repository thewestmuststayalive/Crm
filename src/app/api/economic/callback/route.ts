import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { connectEconomic } from "@/lib/economic-connect";
import { requireRole } from "@/lib/auth";
import { ECONOMIC_STATE_COOKIE } from "@/lib/economic-oauth";

/**
 * e-conomic sender brugeren hertil med ?token=… efter godkendelse. Tokenet gemmes kun, hvis
 * den samme administrator lige har startet forbindelsen fra dette firma (cookie), så ingen
 * udefra kan koble et fremmed regnskab på.
 */
export async function GET(request: NextRequest) {
  const { user, workspace } = await requireRole("ADMIN");
  const store = await cookies();
  const saved = store.get(ECONOMIC_STATE_COOKIE)?.value ?? "";
  store.delete({ name: ECONOMIC_STATE_COOKIE, path: "/api/economic" });
  const [nonce, savedWorkspace] = saved.split(".");
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!nonce || savedWorkspace !== workspace.id || !/^[A-Za-z0-9_-]{10,200}$/.test(token)) {
    redirect("/indstillinger/regnskab?fejl=afbrudt");
  }
  let ok = true;
  try {
    await connectEconomic(workspace.id, user.id, token);
  } catch (error) {
    console.error("e-conomic-forbindelse fejlede", error);
    ok = false;
  }
  redirect(ok ? "/indstillinger/regnskab?forbundet=1" : "/indstillinger/regnskab?fejl=token");
}
