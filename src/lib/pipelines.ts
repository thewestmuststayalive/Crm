import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DealStatus } from "@/db/schema";
import { isUuid } from "./validation";

export const DEFAULT_STAGES: { name: string; kind: DealStatus }[] = [
  { name: "Ny", kind: "OPEN" },
  { name: "Kontaktet", kind: "OPEN" },
  { name: "Tilbud sendt", kind: "OPEN" },
  { name: "Vundet", kind: "WON" },
  { name: "Tabt", kind: "LOST" },
];

type Executor = Pick<typeof db, "insert">;

/** Opretter standard-pipelinen "Salg" til et nyt firma. */
export async function createDefaultPipeline(tx: Executor, workspaceId: string) {
  const [pipeline] = await tx
    .insert(schema.pipelines)
    .values({ workspaceId, name: "Salg", position: 0 })
    .returning({ id: schema.pipelines.id });
  await tx
    .insert(schema.pipelineStages)
    .values(DEFAULT_STAGES.map((s, i) => ({ workspaceId, pipelineId: pipeline.id, name: s.name, kind: s.kind, position: i })));
  return pipeline.id;
}

export type Stage = typeof schema.pipelineStages.$inferSelect;
export type PipelineWithStages = typeof schema.pipelines.$inferSelect & { stages: Stage[] };

/** Firmaets pipelines med faser i rækkefølge. */
export async function getPipelines(workspaceId: string): Promise<PipelineWithStages[]> {
  const [pipelines, stages] = await Promise.all([
    db
      .select()
      .from(schema.pipelines)
      .where(eq(schema.pipelines.workspaceId, workspaceId))
      .orderBy(asc(schema.pipelines.position), asc(schema.pipelines.createdAt)),
    db
      .select()
      .from(schema.pipelineStages)
      .where(eq(schema.pipelineStages.workspaceId, workspaceId))
      .orderBy(asc(schema.pipelineStages.position)),
  ]);
  return pipelines.map((p) => ({ ...p, stages: stages.filter((s) => s.pipelineId === p.id) }));
}

export async function getStage(workspaceId: string, stageId: unknown): Promise<Stage | null> {
  if (!isUuid(stageId)) return null;
  const [row] = await db
    .select()
    .from(schema.pipelineStages)
    .where(and(eq(schema.pipelineStages.workspaceId, workspaceId), eq(schema.pipelineStages.id, stageId)))
    .limit(1);
  return row ?? null;
}

/** Første åbne fase i en pipeline (eller i firmaets første pipeline). */
export async function getEntryStage(workspaceId: string, pipelineId?: string | null): Promise<Stage> {
  const pipelines = await getPipelines(workspaceId);
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];
  const stage = pipeline?.stages.find((s) => s.kind === "OPEN") ?? pipeline?.stages[0];
  if (!stage) throw new Error("Firmaet har ingen pipeline med faser");
  return stage;
}

/** Første fase af en bestemt slags (fx vundet) i samme pipeline. */
export async function getStageOfKind(workspaceId: string, pipelineId: string, kind: DealStatus) {
  const [row] = await db
    .select()
    .from(schema.pipelineStages)
    .where(
      and(
        eq(schema.pipelineStages.workspaceId, workspaceId),
        eq(schema.pipelineStages.pipelineId, pipelineId),
        eq(schema.pipelineStages.kind, kind),
      ),
    )
    .orderBy(asc(schema.pipelineStages.position))
    .limit(1);
  return row ?? null;
}
