import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { hasRole } from "./roles";
import { getSessionUser } from "./session";

export const WORKSPACE_COOKIE = "crm_workspace";

export type CurrentUser = { id: string; name: string; email: string };
export type WorkspaceMembership = { id: string; name: string; role: Role };

/** Den indloggede bruger, eller null. Caches pr. request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => getSessionUser());

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export const getMemberships = cache(async (userId: string): Promise<WorkspaceMembership[]> => {
  return db
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(asc(schema.workspaces.name));
});

/**
 * Det aktive workspace (firma) for brugeren. Valget ligger i en cookie, men
 * medlemskabet tjekkes altid i databasen, så cookien kan ikke give adgang.
 */
export const requireWorkspace = cache(async () => {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) redirect("/opret-firma");

  const selectedId = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = memberships.find((m) => m.id === selectedId) ?? memberships[0];
  return { user, workspace, memberships };
});

/** Kræver mindst den angivne rolle i det aktive workspace. */
export async function requireRole(minimum: Role) {
  const ctx = await requireWorkspace();
  if (!hasRole(ctx.workspace.role, minimum)) redirect("/dashboard?fejl=adgang");
  return ctx;
}
