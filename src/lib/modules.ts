import "server-only";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { requireRole, requireWorkspace } from "./auth";

export type Modules = { booking: boolean; agency: boolean };

/** Hvilke moduler er slået til i firmaet (booking/biler og tid/projekter). */
export const getModules = cache(async (workspaceId: string): Promise<Modules> => {
  const [row] = await db
    .select({ booking: schema.workspaces.bookingEnabled, agency: schema.workspaces.agencyEnabled })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  return { booking: row?.booking ?? false, agency: row?.agency ?? false };
});

/** Til sider og handlinger i booking-modulet: kræver login (evt. en rolle) og at modulet er slået til. */
export async function requireBookingModule(minimum?: "ADMIN") {
  const ctx = minimum ? await requireRole(minimum) : await requireWorkspace();
  if (!(await getModules(ctx.workspace.id)).booking) notFound();
  return ctx;
}

/** Til sider og handlinger i modulet Tid og projekter. */
export async function requireAgencyModule(minimum?: "ADMIN") {
  const ctx = minimum ? await requireRole(minimum) : await requireWorkspace();
  if (!(await getModules(ctx.workspace.id)).agency) notFound();
  return ctx;
}
