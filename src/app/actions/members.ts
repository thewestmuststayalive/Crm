"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { roleEnum, type Role } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { pickValues, type ActionState } from "./types";

const roleSchema = z.enum(roleEnum.enumValues);

const addSchema = z.object({
  name: z.string().trim().min(1, "Navn mangler").max(100),
  email: z.string().trim().toLowerCase().email("Ugyldig e-mail"),
  password: z.string().min(8, "Midlertidig adgangskode skal være på mindst 8 tegn").max(200),
  role: roleSchema,
});

/** Kun ejere må tildele eller ændre ejer-rollen. */
function canAssign(actor: Role, target: Role) {
  return target !== "OWNER" || actor === "OWNER";
}

async function ownerCount(workspaceId: string) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.workspaceId, workspaceId), eq(schema.memberships.role, "OWNER")));
  return value;
}

async function getMember(workspaceId: string, userId: string) {
  const [m] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.workspaceId, workspaceId), eq(schema.memberships.userId, userId)))
    .limit(1);
  return m;
}

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  const values = pickValues(formData, ["name", "email", "role"]);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { name, email, password, role } = parsed.data;
  if (!canAssign(workspace.role, role)) return { error: "Kun en ejer kan tildele ejer-rollen", values };

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing) {
    if (await getMember(workspace.id, existing.id)) {
      return { error: "Brugeren er allerede medlem af firmaet", values };
    }
    // Brugeren findes i forvejen (fx i et andet af dine firmaer): behold navn og adgangskode.
    await db.insert(schema.memberships).values({ userId: existing.id, workspaceId: workspace.id, role });
    revalidatePath("/indstillinger/medlemmer");
    return { success: `${email} fandtes allerede og har nu adgang. Den eksisterende adgangskode gælder.` };
  }

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ name, email, passwordHash })
      .returning({ id: schema.users.id });
    await tx.insert(schema.memberships).values({ userId: user.id, workspaceId: workspace.id, role });
  });
  revalidatePath("/indstillinger/medlemmer");
  return { success: `${name} er oprettet. Giv personen e-mail og midlertidig adgangskode.` };
}

export async function changeRole(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  const parsedRole = roleSchema.safeParse(formData.get("role"));
  if (!parsedRole.success) return;
  const role = parsedRole.data;

  const target = await getMember(workspace.id, userId);
  if (!target) return;
  // Admins må ikke ændre ejere eller gøre nogen til ejer.
  if (!canAssign(workspace.role, role) || !canAssign(workspace.role, target.role)) return;
  // Firmaet skal altid have mindst én ejer.
  if (target.role === "OWNER" && role !== "OWNER" && (await ownerCount(workspace.id)) <= 1) return;
  // Undgå at man ved en fejl fjerner sin egen admin-adgang.
  if (userId === user.id && role === "MEMBER") return;

  await db
    .update(schema.memberships)
    .set({ role })
    .where(and(eq(schema.memberships.workspaceId, workspace.id), eq(schema.memberships.userId, userId)));
  revalidatePath("/indstillinger/medlemmer");
}

export async function removeMember(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  if (userId === user.id) return;

  const target = await getMember(workspace.id, userId);
  if (!target) return;
  if (!canAssign(workspace.role, target.role)) return;
  if (target.role === "OWNER" && (await ownerCount(workspace.id)) <= 1) return;

  await db
    .delete(schema.memberships)
    .where(and(eq(schema.memberships.workspaceId, workspace.id), eq(schema.memberships.userId, userId)));
  revalidatePath("/indstillinger/medlemmer");
}
