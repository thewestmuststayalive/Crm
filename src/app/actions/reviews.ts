"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { REVIEW_DELAY_OPTIONS } from "@/lib/reviews";
import type { ActionState } from "./types";

function isWebUrl(v: string) {
  try {
    const url = new URL(v);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || isWebUrl(v), "Linket skal være en webadresse, der starter med https://"),
  delayDays: z.coerce.number().refine((n) => (REVIEW_DELAY_OPTIONS as readonly number[]).includes(n)),
  message: z.string().trim().max(2000),
});

export async function saveReviewSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const values = {
    url: String(formData.get("url") ?? ""),
    delayDays: String(formData.get("delayDays") ?? "3"),
    message: String(formData.get("message") ?? ""),
    enabled: formData.get("enabled") === "on" ? "on" : "",
  };
  const parsed = settingsSchema.safeParse({ ...values, enabled: values.enabled === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  if (parsed.data.enabled && !parsed.data.url) {
    return { error: "Indsæt linket til jeres anmeldelsesside for at slå anmeldelser til.", values };
  }
  await db
    .update(schema.workspaces)
    .set({
      reviewEnabled: parsed.data.enabled,
      reviewUrl: parsed.data.url || null,
      reviewDelayDays: parsed.data.delayDays,
      reviewMessage: parsed.data.message || null,
    })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath("/indstillinger/anmeldelser");
  return { success: parsed.data.enabled ? "Gemt. Anmeldelser er slået til." : "Gemt. Anmeldelser er slået fra." };
}
