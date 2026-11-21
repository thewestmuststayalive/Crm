import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import {
  addPipeline,
  addStage,
  deletePipeline,
  deleteStage,
  moveStage,
  renamePipeline,
  updateStage,
} from "@/app/actions/pipelines";
import { Button, Card, ConfirmButton, Input, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { requireWorkspace } from "@/lib/auth";
import { DEAL_STATUS_LABELS } from "@/lib/labels";
import { getPipelines } from "@/lib/pipelines";
import { hasRole } from "@/lib/roles";

export const metadata: Metadata = { title: "Salgsfaser" };

const KIND_OPTIONS = [
  ["OPEN", "Åben"],
  ["WON", "Vundet"],
  ["LOST", "Tabt"],
] as const;

export default async function StagesPage({ searchParams }: PageProps<"/indstillinger/salgsfaser">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const pipelines = await getPipelines(workspace.id);
  const dealCounts = new Map(
    (
      await db
        .select({ stageId: schema.deals.stageId, n: count() })
        .from(schema.deals)
        .where(eq(schema.deals.workspaceId, workspace.id))
        .groupBy(schema.deals.stageId)
    ).map((r) => [r.stageId, r.n]),
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Bestem selv faserne i dit salg. Hver fase er enten <strong>åben</strong>, <strong>vundet</strong> eller{" "}
        <strong>tabt</strong> – det styrer nøgletal, automatik og om kontakten bliver kunde. Har firmaet flere slags
        salg (fx projekter og serviceaftaler), kan du oprette flere pipelines.
      </p>
      {typeof sp.besked === "string" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {sp.besked}
        </p>
      )}
      {typeof sp.fejlbesked === "string" && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.fejlbesked}
        </p>
      )}

      {pipelines.map((pipeline) => {
        const hasWon = pipeline.stages.some((s) => s.kind === "WON");
        return (
          <Card key={pipeline.id}>
            <section aria-label={`Pipeline ${pipeline.name}`} className="space-y-4">
              {isAdmin ? (
                <form action={renamePipeline} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={pipeline.id} />
                  <label htmlFor={`p-${pipeline.id}`} className="sr-only">
                    Navn på pipeline
                  </label>
                  <Input id={`p-${pipeline.id}`} name="name" defaultValue={pipeline.name} className="max-w-xs font-semibold" />
                  <Button variant="secondary" type="submit">
                    Omdøb
                  </Button>
                  {pipelines.length > 1 && (
                    <span className="ml-auto">
                      <ConfirmButton message={`Slet pipelinen "${pipeline.name}"?`} formAction={deletePipeline} name="id" value={pipeline.id}>
                        Slet pipeline
                      </ConfirmButton>
                    </span>
                  )}
                </form>
              ) : (
                <h2 className="text-base font-semibold text-slate-900">{pipeline.name}</h2>
              )}

              {!hasWon && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Pipelinen har ingen &quot;Vundet&quot;-fase. Accepterede tilbud kan derfor ikke markere dealen som vundet.
                </p>
              )}

              <ol className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {pipeline.stages.map((stage, i) => {
                  const n = dealCounts.get(stage.id) ?? 0;
                  const others = pipeline.stages.filter((s) => s.id !== stage.id);
                  return (
                    <li key={stage.id} className="flex flex-wrap items-center gap-2 p-3" aria-label={`Fase ${stage.name}`}>
                      {isAdmin ? (
                        <>
                          <form action={updateStage} className="flex flex-1 flex-wrap items-center gap-2">
                            <input type="hidden" name="id" value={stage.id} />
                            <label className="sr-only" htmlFor={`s-${stage.id}`}>
                              Navn på fase
                            </label>
                            <Input id={`s-${stage.id}`} name="name" defaultValue={stage.name} className="max-w-48" />
                            <label className="sr-only" htmlFor={`k-${stage.id}`}>
                              Type
                            </label>
                            <Select id={`k-${stage.id}`} name="kind" defaultValue={stage.kind}>
                              {KIND_OPTIONS.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                            <Button variant="secondary" type="submit" className="px-2.5 py-1 text-xs">
                              Gem
                            </Button>
                            <span className="text-xs text-slate-400">{n} deals</span>
                          </form>
                          <div className="flex items-center gap-1">
                            <form action={moveStage}>
                              <input type="hidden" name="id" value={stage.id} />
                              <input type="hidden" name="direction" value="up" />
                              <Button variant="secondary" type="submit" className="px-2 py-1 text-xs" disabled={i === 0} aria-label={`Flyt ${stage.name} op`}>
                                ↑
                              </Button>
                            </form>
                            <form action={moveStage}>
                              <input type="hidden" name="id" value={stage.id} />
                              <input type="hidden" name="direction" value="down" />
                              <Button
                                variant="secondary"
                                type="submit"
                                className="px-2 py-1 text-xs"
                                disabled={i === pipeline.stages.length - 1}
                                aria-label={`Flyt ${stage.name} ned`}
                              >
                                ↓
                              </Button>
                            </form>
                            <form action={deleteStage} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={stage.id} />
                              {n > 0 && (
                                <>
                                  <label className="sr-only" htmlFor={`m-${stage.id}`}>
                                    Flyt deals til
                                  </label>
                                  <Select id={`m-${stage.id}`} name="moveTo" defaultValue={others[0]?.id} className="py-1 text-xs">
                                    {others.map((o) => (
                                      <option key={o.id} value={o.id}>
                                        Flyt til {o.name}
                                      </option>
                                    ))}
                                  </Select>
                                </>
                              )}
                              <ConfirmButton message={`Slet fasen "${stage.name}"?`} className="px-2 py-1 text-xs">
                                Slet
                              </ConfirmButton>
                            </form>
                          </div>
                        </>
                      ) : (
                        <span className="text-sm text-slate-800">
                          {stage.name} <span className="text-slate-400">· {DEAL_STATUS_LABELS[stage.kind]}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>

              {isAdmin && (
                <form action={addStage} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="pipelineId" value={pipeline.id} />
                  <label className="sr-only" htmlFor={`new-${pipeline.id}`}>
                    Ny fase
                  </label>
                  <Input id={`new-${pipeline.id}`} name="name" placeholder="Ny fase, fx Besigtigelse" className="max-w-60" required />
                  <Select name="kind" defaultValue="OPEN" aria-label="Type for ny fase">
                    {KIND_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit">Tilføj fase</Button>
                </form>
              )}
            </section>
          </Card>
        );
      })}

      {isAdmin && (
        <Card title="Ny pipeline" description="Fx en særskilt proces for serviceaftaler eller større projekter.">
          <form action={addPipeline} className="flex flex-wrap gap-2">
            <label htmlFor="new-pipeline" className="sr-only">
              Navn
            </label>
            <Input id="new-pipeline" name="name" placeholder="Navn på pipeline" className="max-w-xs" required />
            <Button type="submit">Opret pipeline</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
