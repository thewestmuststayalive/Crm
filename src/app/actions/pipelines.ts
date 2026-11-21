"use server";

import { and, asc, count, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { dealStatusEnum } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { createDefaultPipeline } from "@/lib/pipelines";
import { isUuid } from "@/lib/validation";

const PATH = "/indstillinger/salgsfaser";
const nameSchema = z.string().trim().min(1, "Navn mangler").max(60, "Højst 60 tegn");

function done(message: string, kind: "ok" | "fejl" = "ok"): never {
  revalidatePath("/", "layout");
  redirect(`${PATH}?${kind === "ok" ? "besked" : "fejlbesked"}=${encodeURIComponent(message)}`);
}

async function getPipeline(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.pipelines)
    .where(and(eq(schema.pipelines.workspaceId, workspaceId), eq(schema.pipelines.id, id)))
    .limit(1);
  return row ?? null;
}

async function getStageRow(workspaceId: string, id: unknown) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(schema.pipelineStages)
    .where(and(eq(schema.pipelineStages.workspaceId, workspaceId), eq(schema.pipelineStages.id, id)))
    .limit(1);
  return row ?? null;
}

async function stagesOf(pipelineId: string) {
  return db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.pipelineId, pipelineId))
    .orderBy(asc(schema.pipelineStages.position));
}

export async function addPipeline(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) done(name.error.issues[0].message, "fejl");
  const id = await db.transaction(async (tx) => {
    const pipelineId = await createDefaultPipeline(tx, workspace.id);
    const [{ pos }] = await tx
      .select({ pos: max(schema.pipelines.position) })
      .from(schema.pipelines)
      .where(eq(schema.pipelines.workspaceId, workspace.id));
    await tx
      .update(schema.pipelines)
      .set({ name: name.data, position: (pos ?? 0) + 1 })
      .where(eq(schema.pipelines.id, pipelineId));
    return pipelineId;
  });
  void id;
  done(`Pipelinen "${name.data}" er oprettet med standardfaserne. Tilpas dem herunder.`);
}

export async function renamePipeline(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const pipeline = await getPipeline(workspace.id, formData.get("id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!pipeline) return;
  if (!name.success) done(name.error.issues[0].message, "fejl");
  await db.update(schema.pipelines).set({ name: name.data }).where(eq(schema.pipelines.id, pipeline.id));
  done("Gemt.");
}

export async function deletePipeline(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const pipeline = await getPipeline(workspace.id, formData.get("id"));
  if (!pipeline) return;
  const [[{ n: pipelines }], [{ n: deals }]] = await Promise.all([
    db.select({ n: count() }).from(schema.pipelines).where(eq(schema.pipelines.workspaceId, workspace.id)),
    db.select({ n: count() }).from(schema.deals).where(eq(schema.deals.pipelineId, pipeline.id)),
  ]);
  if (pipelines <= 1) done("Firmaet skal have mindst én pipeline.", "fejl");
  if (deals > 0) done(`Pipelinen har ${deals} deals. Flyt eller slet dem først.`, "fejl");
  await db.delete(schema.pipelines).where(eq(schema.pipelines.id, pipeline.id));
  done(`Pipelinen "${pipeline.name}" er slettet.`);
}

export async function addStage(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const pipeline = await getPipeline(workspace.id, formData.get("pipelineId"));
  if (!pipeline) return;
  const name = nameSchema.safeParse(formData.get("name"));
  const kind = z.enum(dealStatusEnum.enumValues).catch("OPEN").parse(formData.get("kind"));
  if (!name.success) done(name.error.issues[0].message, "fejl");

  // Nye åbne faser placeres før de lukkede (vundet/tabt), så rækkefølgen giver mening.
  const stages = await stagesOf(pipeline.id);
  const firstClosed = stages.findIndex((s) => s.kind !== "OPEN");
  const insertAt = kind === "OPEN" && firstClosed >= 0 ? firstClosed : stages.length;
  await db.transaction(async (tx) => {
    for (const [i, s] of stages.entries()) {
      const position = i >= insertAt ? i + 1 : i;
      if (s.position !== position) {
        await tx.update(schema.pipelineStages).set({ position }).where(eq(schema.pipelineStages.id, s.id));
      }
    }
    await tx
      .insert(schema.pipelineStages)
      .values({ workspaceId: workspace.id, pipelineId: pipeline.id, name: name.data, kind, position: insertAt });
  });
  done(`Fasen "${name.data}" er tilføjet.`);
}

export async function updateStage(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const stage = await getStageRow(workspace.id, formData.get("id"));
  if (!stage) return;
  const name = nameSchema.safeParse(formData.get("name"));
  const kind = z.enum(dealStatusEnum.enumValues).catch(stage.kind).parse(formData.get("kind"));
  if (!name.success) done(name.error.issues[0].message, "fejl");

  if (stage.kind === "OPEN" && kind !== "OPEN") {
    const open = (await stagesOf(stage.pipelineId)).filter((s) => s.kind === "OPEN");
    if (open.length <= 1) done("Pipelinen skal have mindst én åben fase.", "fejl");
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.pipelineStages).set({ name: name.data, kind }).where(eq(schema.pipelineStages.id, stage.id));
    // Deals i fasen følger fasens nye status.
    if (kind !== stage.kind) {
      await tx
        .update(schema.deals)
        .set({ status: kind, closedAt: kind === "OPEN" ? null : new Date() })
        .where(eq(schema.deals.stageId, stage.id));
    }
  });
  done("Gemt.");
}

export async function moveStage(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const stage = await getStageRow(workspace.id, formData.get("id"));
  if (!stage) return;
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const stages = await stagesOf(stage.pipelineId);
  const i = stages.findIndex((s) => s.id === stage.id);
  const j = i + direction;
  if (j < 0 || j >= stages.length) return;
  const reordered = [...stages];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  await db.transaction(async (tx) => {
    for (const [position, s] of reordered.entries()) {
      await tx.update(schema.pipelineStages).set({ position }).where(eq(schema.pipelineStages.id, s.id));
    }
  });
  revalidatePath("/", "layout");
  redirect(PATH);
}

export async function deleteStage(formData: FormData) {
  const { workspace } = await requireRole("ADMIN");
  const stage = await getStageRow(workspace.id, formData.get("id"));
  if (!stage) return;
  const stages = await stagesOf(stage.pipelineId);
  if (stages.length <= 1) done("En pipeline skal have mindst én fase.", "fejl");
  if (stage.kind === "OPEN" && stages.filter((s) => s.kind === "OPEN").length <= 1) {
    done("Pipelinen skal have mindst én åben fase.", "fejl");
  }

  const [{ n: deals }] = await db.select({ n: count() }).from(schema.deals).where(eq(schema.deals.stageId, stage.id));
  const target = stages.find((s) => s.id === formData.get("moveTo") && s.id !== stage.id);
  if (deals > 0 && !target) done(`Fasen har ${deals} deals. Vælg hvilken fase de skal flyttes til.`, "fejl");

  await db.transaction(async (tx) => {
    if (target) {
      await tx
        .update(schema.deals)
        .set({ stageId: target.id, status: target.kind, closedAt: target.kind === "OPEN" ? null : new Date() })
        .where(eq(schema.deals.stageId, stage.id));
    }
    await tx.delete(schema.pipelineStages).where(eq(schema.pipelineStages.id, stage.id));
  });
  done(`Fasen "${stage.name}" er slettet${target && deals > 0 ? `, og ${deals} deals er flyttet til "${target.name}"` : ""}.`);
}
