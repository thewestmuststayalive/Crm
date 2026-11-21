import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Antal ulæste notifikationer og de nyeste siden `efter` (ISO-tid).
 * Hentes af browseren hvert halve minut, så der kan vises skrivebordsnotifikationer.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Ikke logget ind" }, { status: 401 });

  const afterParam = request.nextUrl.searchParams.get("efter");
  const after = afterParam && !Number.isNaN(Date.parse(afterParam)) ? new Date(afterParam) : null;

  const [[{ unread }], latest] = await Promise.all([
    db
      .select({ unread: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
    after
      ? db
          .select({
            id: schema.notifications.id,
            title: schema.notifications.title,
            body: schema.notifications.body,
            createdAt: schema.notifications.createdAt,
          })
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.userId, user.id),
              isNull(schema.notifications.readAt),
              gt(schema.notifications.createdAt, after),
            ),
          )
          .orderBy(desc(schema.notifications.createdAt))
          .limit(5)
      : Promise.resolve([]),
  ]);

  return Response.json(
    { unread, latest, now: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
