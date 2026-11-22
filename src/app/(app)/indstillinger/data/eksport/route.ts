import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exportWorkspace } from "@/lib/backup";

/** Download af alle firmaets data som JSON. Kun administratorer. */
export async function GET() {
  const { user, workspace } = await requireRole("ADMIN");
  const data = await exportWorkspace(workspace.id);
  await audit(workspace.id, user.id, "Alle data downloadet (sikkerhedskopi)");
  const date = new Date().toISOString().slice(0, 10);
  const safeName = workspace.name.replace(/[^A-Za-z0-9æøåÆØÅ_-]+/g, "-").slice(0, 40) || "firma";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="kundespor-${encodeURIComponent(safeName)}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
