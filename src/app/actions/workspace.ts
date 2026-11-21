"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getMemberships, requireRole, requireUser, WORKSPACE_COOKIE } from "@/lib/auth";
import { createDefaultPipeline } from "@/lib/pipelines";
import type { ActionState } from "./types";

const nameSchema = z.string().trim().min(1, "Firmanavn mangler").max(100);

async function setActiveWorkspace(id: string) {
  (await cookies()).set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
}

/** Opretter et nyt firma, hvor den indloggede bruger bliver ejer. */
export async function createWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const id = await db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(schema.workspaces)
      .values({ name: parsed.data })
      .returning({ id: schema.workspaces.id });
    await tx.insert(schema.memberships).values({ userId: user.id, workspaceId: ws.id, role: "OWNER" });
    await createDefaultPipeline(tx, ws.id);
    return ws.id;
  });

  await setActiveWorkspace(id);
  redirect("/dashboard");
}

export async function switchWorkspace(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("workspaceId") ?? "");
  const memberships = await getMemberships(user.id);
  if (memberships.some((m) => m.id === id)) await setActiveWorkspace(id);
  redirect("/dashboard");
}

export async function renameWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const target = z.coerce.number().int().min(5).max(7 * 24 * 60).safeParse(formData.get("responseTargetMinutes"));
  if (!target.success) return { error: "Svartidsmålet skal være mellem 5 minutter og 7 dage" };
  await db
    .update(schema.workspaces)
    .set({ name: parsed.data, responseTargetMinutes: target.data })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath("/", "layout");
  return { success: "Firmaoplysningerne er gemt" };
}

const sellerSchema = z.object({
  cvr: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{8}$/.test(v.replace(/\s/g, "")), "CVR-nummeret skal være 8 cifre"),
  address: z.string().trim().max(300),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Ugyldig e-mail"),
  phone: z.string().trim().max(40),
  website: z.string().trim().max(200),
  quoteTerms: z.string().trim().max(10000),
});

const SELLER_KEYS = ["cvr", "address", "email", "phone", "website", "quoteTerms"] as const;

/** Firmaoplysninger og standardbetingelser, der vises på tilbud. */
export async function updateQuoteSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const raw = Object.fromEntries(SELLER_KEYS.map((k) => [k, String(formData.get(k) ?? "")]));
  const parsed = sellerSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: raw };
  const d = parsed.data;
  await db
    .update(schema.workspaces)
    .set({
      cvr: d.cvr.replace(/\s/g, "") || null,
      address: d.address || null,
      email: d.email || null,
      phone: d.phone || null,
      website: d.website || null,
      quoteTerms: d.quoteTerms || null,
    })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath("/indstillinger");
  return { success: "Oplysningerne på tilbud er gemt" };
}
