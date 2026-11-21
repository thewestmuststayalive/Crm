import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { getMetaConfig } from "@/lib/meta/graph";
import { syncInsights } from "@/lib/meta/insights";

// Kaldes dagligt af hostingens cron (fx Vercel Cron) med "Authorization: Bearer <CRON_SECRET>".

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  if (!getMetaConfig()) return Response.json({ ok: true, skipped: "Meta er ikke sat op" });

  const workspaces = await db.selectDistinct({ id: schema.metaAdAccounts.workspaceId }).from(schema.metaAdAccounts);
  const results: { workspaceId: string; rows?: number; error?: string }[] = [];
  for (const ws of workspaces) {
    try {
      const r = await syncInsights(ws.id);
      results.push({ workspaceId: ws.id, rows: r.rows });
    } catch (error) {
      results.push({ workspaceId: ws.id, error: error instanceof Error ? error.message : "Ukendt fejl" });
    }
  }
  return Response.json({ ok: true, results });
}
