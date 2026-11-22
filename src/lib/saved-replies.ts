import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Færdige skabeloner, et firma kan starte med. {navn} og {firma} udfyldes, når de bruges. */
export const STARTER_REPLIES = [
  {
    title: "Tak for beskeden",
    body: "Hej {navn}\n\nTak for din besked! Vi vender tilbage hurtigst muligt i dag.\n\nVenlig hilsen\n{firma}",
  },
  {
    title: "Pris og tilbud",
    body: "Hej {navn}\n\nTak for din interesse. Hvis du sender os lidt flere detaljer, laver vi et uforpligtende tilbud til dig.\n\nVenlig hilsen\n{firma}",
  },
  {
    title: "Book en tid",
    body: "Hej {navn}\n\nDu kan booke en tid direkte her: (indsæt jeres bookinglink)\n\nVi glæder os til at se dig!\n{firma}",
  },
];

export async function getSavedReplies(workspaceId: string) {
  return db
    .select()
    .from(schema.savedReplies)
    .where(eq(schema.savedReplies.workspaceId, workspaceId))
    .orderBy(asc(schema.savedReplies.position), asc(schema.savedReplies.createdAt));
}
