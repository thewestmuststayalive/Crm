"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { brandedEmail, isEmailConfigured, sendEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { createSession, deleteAllSessionsForUser } from "@/lib/session";
import { consumeToken, createAuthToken, findValidToken, recentTokenCount } from "@/lib/tokens";
import { getAppUrl } from "@/lib/url";
import { pickValues, type ActionState } from "./types";

const GENERIC_OK =
  "Hvis e-mailen findes i Kundespor, har vi sendt et link til at vælge en ny adgangskode. Linket virker i 1 time.";

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isEmailConfigured()) {
    return { error: "Kundespor kan ikke sende e-mails endnu. Bed en administrator om at nulstille din adgangskode." };
  }
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Skriv en gyldig e-mail", values: pickValues(formData, ["email"]) };

  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data))
    .limit(1);

  // Samme svar uanset om e-mailen findes, så ingen kan aflure hvem der har en konto.
  if (user && (await recentTokenCount(user.id)) < 3) {
    const token = await createAuthToken(user.id, "RESET");
    const url = `${await getAppUrl()}/nulstil/${token}`;
    await sendEmail({
      to: user.email,
      subject: "Vælg en ny adgangskode til Kundespor",
      ...brandedEmail({
        heading: `Hej ${user.name.split(" ")[0]}`,
        paragraphs: [
          "Vi har fået en anmodning om at nulstille din adgangskode til Kundespor.",
          "Klik på knappen for at vælge en ny. Linket virker i 1 time. Har du ikke bedt om det, kan du se bort fra denne e-mail.",
        ],
        button: { label: "Vælg ny adgangskode", url },
      }),
    });
  }
  return { success: GENERIC_OK };
}

export async function setPasswordWithToken(token: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .string()
    .min(8, "Adgangskoden skal være på mindst 8 tegn")
    .max(200)
    .safeParse(formData.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get("password") !== formData.get("confirm")) return { error: "De to adgangskoder er ikke ens" };

  const valid = await findValidToken(token);
  if (!valid) return { error: "Linket er udløbet eller allerede brugt. Bed om et nyt." };
  if (!(await consumeToken(token))) return { error: "Linket er allerede brugt. Bed om et nyt." };

  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data) })
    .where(eq(schema.users.id, valid.userId));
  await deleteAllSessionsForUser(valid.userId);
  await createSession(valid.userId);
  redirect("/dashboard");
}
