"use server";

import { requireWorkspace } from "@/lib/auth";
import { CvrError, lookupCvr, type CvrCompany } from "@/lib/cvr";

export type CvrResult = { company?: CvrCompany; error?: string };

/** Slår en virksomhed op i CVR på nummer eller navn. Kræver login. */
export async function findCompanyInCvr(query: string): Promise<CvrResult> {
  await requireWorkspace();
  try {
    const company = await lookupCvr(String(query ?? ""));
    return company ? { company } : { error: "Ingen virksomhed fundet i CVR." };
  } catch (error) {
    return { error: error instanceof CvrError ? error.message : "CVR-opslaget fejlede." };
  }
}
