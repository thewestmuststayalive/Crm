import { requireWorkspace } from "@/lib/auth";
import { getContact, logEvent } from "@/lib/crm";
import { exportPersonData } from "@/lib/gdpr";

/** Henter alle data om en kontakt som JSON (indsigtsret). */
export async function GET(_request: Request, ctx: RouteContext<"/kunder/[id]/persondata">) {
  const { user, workspace } = await requireWorkspace();
  const { id } = await ctx.params;
  const contact = await getContact(workspace.id, id);
  if (!contact) return new Response("Ikke fundet", { status: 404 });
  const data = await exportPersonData(workspace.id, contact.id);
  if (!data) return new Response("Ikke fundet", { status: 404 });
  await logEvent(workspace.id, user.id, "Persondata eksporteret", {
    contactId: contact.id,
    companyId: contact.companyId,
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="persondata-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
