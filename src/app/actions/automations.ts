"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { automationTypeEnum } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { AUTOMATIONS, runAutomations } from "@/lib/automations";
import type { ActionState } from "./types";

const PATH = "/indstillinger/automatik";

export async function saveAutomation(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const type = z.enum(automationTypeEnum.enumValues).safeParse(formData.get("type"));
  if (!type.success) return;
  const allowed = AUTOMATIONS[type.data].dayOptions;
  const days = Number(formData.get("days") ?? AUTOMATIONS[type.data].defaultDays);
  const enabled = formData.get("enabled") === "on";
  const values = { enabled, days: allowed.includes(days) ? days : AUTOMATIONS[type.data].defaultDays };
  await db
    .insert(schema.automationRules)
    .values({ workspaceId: workspace.id, type: type.data, ...values })
    .onConflictDoUpdate({ target: [schema.automationRules.workspaceId, schema.automationRules.type], set: values });
  revalidatePath(PATH);
}

/** Kører reglerne med det samme (de kører ellers automatisk hver morgen). */
export async function runAutomationsNow(): Promise<ActionState> {
  const { workspace } = await requireRole("ADMIN");
  const r = await runAutomations(workspace.id);
  const total = r.STALE_LEAD + r.PROPOSAL_FOLLOWUP + r.CLOSE_DATE_PASSED;
  revalidatePath("/", "layout");
  return {
    success:
      total === 0
        ? "Reglerne er kørt. Der var ingen nye opfølgninger at oprette."
        : `Reglerne er kørt: ${total} ${total === 1 ? "opgave" : "opgaver"} oprettet.`,
  };
}
