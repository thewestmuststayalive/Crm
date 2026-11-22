"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { leadSourceEnum } from "@/db/schema";
import { requireRole, requireWorkspace } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getCompany, getContact, getDeal, isMemberOf, logEvent } from "@/lib/crm";
import { onStageChange, parseKroner } from "@/lib/deals";
import { getCustomFields, parseCustomValues } from "@/lib/custom-fields";
import { getEntryStage, getStage } from "@/lib/pipelines";
import { isUuid, optionalId, optionalText } from "@/lib/validation";
import { pickValues, type ActionState } from "./types";

const dealSchema = z.object({
  title: z.string().trim().min(1, "Titel mangler").max(200),
  value: z.string().default(""),
  stageId: optionalId,
  source: z.enum(leadSourceEnum.enumValues),
  contactId: optionalId,
  companyId: optionalId,
  ownerId: optionalId,
  expectedCloseDate: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Ugyldig dato")
    .nullable()
    .default(null),
  lostReason: optionalText(500),
});

const FIELDS = [
  "title",
  "value",
  "stageId",
  "source",
  "contactId",
  "companyId",
  "ownerId",
  "expectedCloseDate",
  "lostReason",
];

async function parseDeal(workspaceId: string, formData: FormData) {
  const parsed = dealSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const { value: rawValue, ...data } = parsed.data;

  const value = parseKroner(rawValue);
  if (value === null) return { error: "Ugyldigt beløb" } as const;

  let companyId = data.companyId;
  if (data.contactId) {
    const contact = await getContact(workspaceId, data.contactId);
    if (!contact) return { error: "Den valgte kontakt findes ikke" } as const;
    companyId ??= contact.companyId; // Arv kontaktens virksomhed, hvis ingen er valgt.
  }
  if (companyId && !(await getCompany(workspaceId, companyId))) {
    return { error: "Den valgte virksomhed findes ikke" } as const;
  }
  if (data.ownerId && !(await isMemberOf(workspaceId, data.ownerId))) {
    return { error: "Den valgte ansvarlige er ikke medlem af firmaet" } as const;
  }
  // Fasen bestemmer også pipelinen. Uden valg bruges første åbne fase i firmaets første pipeline.
  const stage = data.stageId ? await getStage(workspaceId, data.stageId) : await getEntryStage(workspaceId);
  if (!stage) return { error: "Den valgte fase findes ikke" } as const;
  const custom = parseCustomValues(await getCustomFields(workspaceId, "DEAL"), formData);
  if ("error" in custom) return { error: custom.error } as const;
  const { stageId: _ignored, ...rest } = data;
  void _ignored;
  return { values: { ...rest, companyId, value, custom: custom.values }, stage } as const;
}

export async function createDeal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const result = await parseDeal(workspace.id, formData);
  if ("error" in result) return { error: result.error, values: pickValues(formData, FIELDS) };

  const { values, stage } = result;
  const [deal] = await db
    .insert(schema.deals)
    .values({
      ...values,
      workspaceId: workspace.id,
      pipelineId: stage.pipelineId,
      stageId: stage.id,
      status: stage.kind,
      closedAt: stage.kind === "OPEN" ? null : new Date(),
    })
    .returning();
  await logEvent(workspace.id, user.id, `Deal "${deal.title}" oprettet i fasen ${stage.name}`, {
    dealId: deal.id,
    contactId: deal.contactId,
    companyId: deal.companyId,
  });
  redirect(`/pipeline/${deal.id}`);
}

export async function updateDeal(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireWorkspace();
  const deal = await getDeal(workspace.id, id);
  if (!deal) return { error: "Dealen findes ikke" };

  const result = await parseDeal(workspace.id, formData);
  if ("error" in result) return { error: result.error, values: pickValues(formData, FIELDS) };

  const { values, stage } = result;
  await db
    .update(schema.deals)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(schema.deals.workspaceId, workspace.id), eq(schema.deals.id, id)));
  await onStageChange({ ...deal, ...values }, stage, user.id);
  revalidatePath(`/pipeline/${id}`);
  redirect(`/pipeline/${id}`);
}

/** Flytter en deal til en anden fase (fra kanban-tavlen eller dealsiden). */
export async function moveDeal(id: string, stageId: string) {
  const { user, workspace } = await requireWorkspace();
  const [deal, stage] = await Promise.all([getDeal(workspace.id, id), getStage(workspace.id, stageId)]);
  if (!deal || !stage) return;
  await onStageChange(deal, stage, user.id);
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
}

export async function deleteDeal(formData: FormData) {
  const { user, workspace } = await requireRole("ADMIN");
  const id = formData.get("id");
  if (!isUuid(id)) return;
  const [deleted] = await db
    .delete(schema.deals)
    .where(and(eq(schema.deals.workspaceId, workspace.id), eq(schema.deals.id, id)))
    .returning({ title: schema.deals.title });
  if (deleted) await audit(workspace.id, user.id, "Deal slettet", deleted.title);
  revalidatePath("/pipeline");
  redirect("/pipeline");
}
