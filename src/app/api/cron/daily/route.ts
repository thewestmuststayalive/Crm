import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { runAutomations } from "@/lib/automations";
import { sendDailyDigests } from "@/lib/digest";
import { cleanupStaleLeads } from "@/lib/gdpr";
import { getMetaConfig } from "@/lib/meta/graph";
import { syncInsights } from "@/lib/meta/insights";
import { sendDueReviewRequests } from "@/lib/reviews";

// Daglig kørsel (Vercel Cron, se vercel.json) med "Authorization: Bearer <CRON_SECRET>":
// 1) automatiske opfølgningsregler, 2) annoncedata fra Meta, 3) anmodninger om anmeldelse,
// 4) sletning af gamle leads (hvor det er slået til), 5) daglig e-mail-oversigt.

export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const report: Record<string, unknown> = {};

  const workspaces = await db.select({ id: schema.workspaces.id }).from(schema.workspaces);
  let tasksCreated = 0;
  for (const ws of workspaces) {
    try {
      const r = await runAutomations(ws.id);
      tasksCreated += r.STALE_LEAD + r.PROPOSAL_FOLLOWUP + r.CLOSE_DATE_PASSED;
    } catch (error) {
      console.error("Automatik fejlede for", ws.id, error);
    }
  }
  report.tasksCreated = tasksCreated;

  if (getMetaConfig()) {
    const withAds = await db.selectDistinct({ id: schema.metaAdAccounts.workspaceId }).from(schema.metaAdAccounts);
    let rows = 0;
    for (const ws of withAds) {
      try {
        rows += (await syncInsights(ws.id)).rows;
      } catch (error) {
        console.error("Annoncedata fejlede for", ws.id, error);
      }
    }
    report.adRows = rows;
  }

  try {
    report.reviewRequests = await sendDueReviewRequests();
  } catch (error) {
    console.error("Anmodninger om anmeldelse fejlede", error);
  }

  try {
    report.leadsDeleted = await cleanupStaleLeads();
  } catch (error) {
    console.error("Sletning af gamle leads fejlede", error);
  }

  try {
    report.digests = (await sendDailyDigests()).sent;
  } catch (error) {
    console.error("Daglig oversigt fejlede", error);
  }

  return Response.json({ ok: true, ...report });
}
