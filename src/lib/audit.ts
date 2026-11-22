import "server-only";
import { db, schema } from "@/db";

/**
 * Skriver en linje i firmaets aktivitetslog. Fejl må aldrig stoppe selve handlingen,
 * så de logges kun på serveren.
 */
export async function audit(workspaceId: string, userId: string | null, action: string, details?: string | null) {
  try {
    await db.insert(schema.auditLog).values({
      workspaceId,
      userId,
      action: action.slice(0, 200),
      details: details?.slice(0, 1000) ?? null,
    });
  } catch (error) {
    console.error("Aktivitetslog fejlede", error);
  }
}
