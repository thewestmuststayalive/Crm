"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { getMemberships, requireRole, requireUser, requireWorkspace, WORKSPACE_COOKIE } from "@/lib/auth";
import { onboardingCookie } from "@/lib/onboarding";
import { EMAIL_TEXTS, isHexColor, LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/branding";
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
  const { user, workspace } = await requireRole("ADMIN");
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const target = z.coerce
    .number()
    .int()
    .min(5)
    .max(7 * 24 * 60)
    .safeParse(formData.get("responseTargetMinutes"));
  if (!target.success) return { error: "Svartidsmålet skal være mellem 5 minutter og 7 dage" };
  await db
    .update(schema.workspaces)
    .set({ name: parsed.data, responseTargetMinutes: target.data })
    .where(eq(schema.workspaces.id, workspace.id));
  if (parsed.data !== workspace.name)
    await audit(workspace.id, user.id, "Firmanavn ændret", `${workspace.name} → ${parsed.data}`);
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

/** Logo og firmafarve på kundesider og i e-mails. */
export async function saveBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  const color = String(formData.get("brandColor") ?? "");
  if (!isHexColor(color)) return { error: "Vælg en farve" };
  const update: { brandColor: string; logoData?: string | null } = { brandColor: color.toLowerCase() };
  if (formData.get("removeLogo") === "on") update.logoData = null;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!(LOGO_TYPES as readonly string[]).includes(file.type))
      return { error: "Logoet skal være PNG, JPG eller WebP" };
    if (file.size > LOGO_MAX_BYTES) return { error: "Logoet må højst fylde 300 KB" };
    const bytes = Buffer.from(await file.arrayBuffer());
    // Tjek filens indhold, ikke kun den oplyste type.
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isWebp =
      bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    const real = isPng ? "image/png" : isJpeg ? "image/jpeg" : isWebp ? "image/webp" : null;
    if (!real) return { error: "Filen er ikke et gyldigt PNG-, JPG- eller WebP-billede" };
    update.logoData = `data:${real};base64,${bytes.toString("base64")}`;
  }
  await db.update(schema.workspaces).set(update).where(eq(schema.workspaces.id, workspace.id));
  await audit(
    workspace.id,
    user.id,
    "Udseende ændret",
    update.logoData === null ? "Logo fjernet" : update.logoData ? "Nyt logo" : null,
  );
  revalidatePath("/indstillinger");
  return { success: "Udseendet er gemt." };
}

/** Egne tekster i e-mails til kunder. Tom tekst = standardteksten. */
export async function saveEmailTexts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireRole("ADMIN");
  const texts: Record<string, string> = {};
  for (const key of Object.keys(EMAIL_TEXTS)) {
    const value = String(formData.get(key) ?? "")
      .trim()
      .slice(0, 2000);
    if (value) texts[key] = value;
  }
  await db.update(schema.workspaces).set({ emailTexts: texts }).where(eq(schema.workspaces.id, workspace.id));
  await audit(workspace.id, user.id, "E-mailtekster ændret");
  revalidatePath("/indstillinger/e-mails");
  return { success: "Teksterne er gemt." };
}

/** Skjuler "Kom godt i gang" på dashboardet for dette firma (på denne enhed). */
export async function hideOnboarding() {
  const { workspace } = await requireWorkspace();
  (await cookies()).set(onboardingCookie(workspace.id), "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/dashboard");
}

/** Sletter hele firmaet med alle data. Kun ejere, og firmanavnet skal skrives for at bekræfte. */
export async function deleteWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace, memberships } = await requireRole("OWNER");
  const typed = String(formData.get("confirmName") ?? "").trim();
  if (typed !== workspace.name) return { error: "Skriv firmanavnet præcist, som det står, for at bekræfte." };
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspace.id));
  const next = memberships.find((m) => m.id !== workspace.id);
  const jar = await cookies();
  if (next) jar.set(WORKSPACE_COOKIE, next.id, { httpOnly: true, sameSite: "lax", path: "/" });
  else jar.delete(WORKSPACE_COOKIE);
  console.info("Firma slettet", { workspaceId: workspace.id, by: user.id });
  revalidatePath("/", "layout");
  redirect(next ? "/dashboard" : "/opret-firma");
}
