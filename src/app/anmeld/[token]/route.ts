import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getReviewRequestByToken } from "@/lib/reviews";

/** Linket i e-mailen: registrerer klikket og sender kunden videre til anmeldelsessiden. */
export async function GET(_request: Request, ctx: RouteContext<"/anmeld/[token]">) {
  const { token } = await ctx.params;
  const row = await getReviewRequestByToken(token);
  if (!row?.url || !/^https?:\/\//i.test(row.url)) {
    return new Response("Linket er ikke længere gyldigt.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (row.request.status === "SENT") {
    await db
      .update(schema.reviewRequests)
      .set({ status: "CLICKED", clickedAt: new Date() })
      .where(and(eq(schema.reviewRequests.id, row.request.id), eq(schema.reviewRequests.status, "SENT")));
  }
  return new Response(null, { status: 302, headers: { location: row.url, "referrer-policy": "no-referrer" } });
}
