"use server";

import { count, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser, WORKSPACE_COOKIE } from "@/lib/auth";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { createSession, deleteAllSessionsForUser, deleteSession } from "@/lib/session";
import { pickValues, type ActionState } from "./types";

const email = z.string().trim().toLowerCase().email("Ugyldig e-mail");
const password = z.string().min(8, "Adgangskoden skal være på mindst 8 tegn").max(200);

export async function isRegistrationOpen(): Promise<boolean> {
  if (process.env.ALLOW_REGISTRATION === "true") return true;
  const [{ value }] = await db.select({ value: count() }).from(schema.users);
  return value === 0;
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ email, password: z.string().min(1) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  const values = pickValues(formData, ["email"]);
  if (!parsed.success) return { error: "Forkert e-mail eller adgangskode", values };

  const [user] = await db
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email))
    .limit(1);

  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return { error: "Forkert e-mail eller adgangskode", values };

  await createSession(user.id);
  redirect("/dashboard");
}

const registerSchema = z.object({
  name: z.string().trim().min(1, "Navn mangler").max(100),
  email,
  password,
  company: z.string().trim().min(1, "Firmanavn mangler").max(100),
});

export async function register(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isRegistrationOpen())) {
    return { error: "Oprettelse er lukket. Bed en administrator om at tilføje dig." };
  }
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  const values = pickValues(formData, ["name", "email", "company"]);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { name, company } = parsed.data;

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email))
    .limit(1);
  if (existing) return { error: "Der findes allerede en bruger med den e-mail", values };

  const passwordHash = await hashPassword(parsed.data.password);
  const { userId, workspaceId } = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ name, email: parsed.data.email, passwordHash })
      .returning({ id: schema.users.id });
    const [ws] = await tx
      .insert(schema.workspaces)
      .values({ name: company })
      .returning({ id: schema.workspaces.id });
    await tx
      .insert(schema.memberships)
      .values({ userId: user.id, workspaceId: ws.id, role: "OWNER" });
    return { userId: user.id, workspaceId: ws.id };
  });

  await createSession(userId);
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

const profileSchema = z.object({ name: z.string().trim().min(1, "Navn mangler").max(100) });

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(schema.users).set({ name: parsed.data.name }).where(eq(schema.users.id, user.id));
  return { success: "Profilen er gemt" };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ current: z.string().min(1, "Skriv din nuværende adgangskode"), next: password })
    .safeParse({ current: formData.get("current"), next: formData.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [row] = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .limit(1);
  if (!row || !(await verifyPassword(parsed.data.current, row.passwordHash))) {
    return { error: "Den nuværende adgangskode er forkert" };
  }

  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data.next) })
    .where(eq(schema.users.id, user.id));
  // Log ud overalt og log ind igen på denne enhed.
  await deleteAllSessionsForUser(user.id);
  await createSession(user.id);
  return { success: "Adgangskoden er ændret. Andre enheder er logget ud." };
}
