import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/validation";

/** Firmaets logo (til kundesider og e-mails). Adressen indeholder en version, så den kan caches længe. */
export async function GET(_request: Request, ctx: RouteContext<"/logo/[workspaceId]">) {
  const { workspaceId } = await ctx.params;
  if (!isUuid(workspaceId)) return new Response("Ikke fundet", { status: 404 });
  const [row] = await db
    .select({ logo: schema.workspaces.logoData })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  const m = row?.logo ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(row.logo) : null;
  if (!m) return new Response("Ikke fundet", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
