"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { roleEnum, type Role } from "@/db/schema";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ROLE_LABELS } from "@/lib/roles";
import { brandedEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { createAuthToken } from "@/lib/tokens";
import { getAppUrl } from "@/lib/url";
import { pickValues, type ActionState } from "./types";

const roleSchema = z.enum(roleEnum.enumValues);

const addSchema = z.object({
  name: z.string().trim().min(1, "Navn mangler").max(100),
  email: z.string().trim().toLowerCase().email("Ugyldig e-mail"),
  // Valgfri når e-mail er sat op (så sendes en invitation i stedet).
  password: z
    .string()
    .max(200)
    .refine((v) => v === "" || v.length >= 8, "Midlertidig adgangskode skal være på mindst 8 tegn")
    .default(""),
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
    .select({ role: schema.memberships.role, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.workspaceId, workspaceId), eq(schema.memberships.userId, userId)))
    .limit(1);
  return m;
}

export async function addMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user: actor, workspace } = await requireRole("ADMIN");
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  const values = pickValues(formData, ["name", "email", "role"]);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const { name, email, password, role } = parsed.data;
  if (!canAssign(workspace.role, role)) return { error: "Kun en ejer kan tildele ejer-rollen", values };
  const canEmail = isEmailConfigured();
  if (!password && !canEmail) {
    return {
      error: "Angiv en midlertidig adgangskode (Kundespor kan ikke sende invitationer på e-mail endnu)",
      values,
    };
  }
  const appUrl = await getAppUrl();

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
    if (canEmail) {
      await sendEmail({
        to: email,
        subject: `Du har fået adgang til ${workspace.name} i Kundespor`,
        ...brandedEmail({
          heading: `Du har fået adgang til ${workspace.name}`,
          paragraphs: [
            `${actor.name} har givet dig adgang til ${workspace.name}. Du logger ind som du plejer og skifter firma i menuen.`,
          ],
          button: { label: "Åbn Kundespor", url: `${appUrl}/login` },
        }),
      });
    }
    revalidatePath("/indstillinger/medlemmer");
    return { success: `${email} fandtes allerede og har nu adgang. Den eksisterende adgangskode gælder.` };
  }

  // Uden adgangskode får brugeren en tilfældig kode, som ingen kender, og vælger selv en via invitationen.
  const passwordHash = await hashPassword(password || randomBytes(32).toString("base64url"));
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ name, email, passwordHash })
      .returning({ id: schema.users.id });
    await tx.insert(schema.memberships).values({ userId: user.id, workspaceId: workspace.id, role });
    return user.id;
  });

  if (canEmail) {
    const token = await createAuthToken(userId, "INVITE");
    const { sent } = await sendEmail({
      to: email,
      subject: `${actor.name} har inviteret dig til Kundespor`,
      ...brandedEmail({
        heading: `Hej ${name.split(" ")[0]}`,
        paragraphs: [
          `${actor.name} har inviteret dig til ${workspace.name} i Kundespor, hvor I samler kunder, beskeder og opfølgning.`,
          "Klik på knappen for at vælge din adgangskode. Invitationen virker i 7 dage.",
        ],
        button: { label: "Kom i gang", url: `${appUrl}/nulstil/${token}` },
      }),
    });
    revalidatePath("/indstillinger/medlemmer");
    if (sent) return { success: `Invitation sendt til ${email}.` };
    if (!password)
      return { error: `${name} er oprettet, men invitationen kunne ikke sendes. Prøv "Send invitation igen".` };
  }
  revalidatePath("/indstillinger/medlemmer");
  return { success: `${name} er oprettet. Giv personen e-mail og midlertidig adgangskode.` };
}

/** Sender en ny invitation (nyt link) til et medlem, der ikke er kommet i gang. */
export async function resendInvite(formData: FormData) {
  const { user: actor, workspace } = await requireRole("ADMIN");
  const userId = String(formData.get("userId") ?? "");
  if (!isEmailConfigured() || !(await getMember(workspace.id, userId))) return;
  const [target] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!target) return;
  const token = await createAuthToken(userId, "INVITE");
  await sendEmail({
    to: target.email,
    subject: `${actor.name} har inviteret dig til Kundespor`,
    ...brandedEmail({
      heading: `Hej ${target.name.split(" ")[0]}`,
      paragraphs: [
        `${actor.name} har inviteret dig til ${workspace.name} i Kundespor.`,
        "Klik på knappen for at vælge din adgangskode. Invitationen virker i 7 dage.",
      ],
      button: { label: "Kom i gang", url: `${await getAppUrl()}/nulstil/${token}` },
    }),
  });
  revalidatePath("/indstillinger/medlemmer");
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
  await audit(
    workspace.id,
    user.id,
    "Rolle ændret",
    `${target.name}: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[role]}`,
  );
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
  await audit(workspace.id, user.id, "Medlem fjernet", target.name);
  revalidatePath("/indstillinger/medlemmer");
}
