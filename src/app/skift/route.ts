import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getMemberships, requireUser, WORKSPACE_COOKIE } from "@/lib/auth";

/**
 * Skifter aktivt firma og sender videre til en side i det firma.
 * Bruges af "Alle firmaer"-visningen, så links til andre firmaers data virker.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const ws = request.nextUrl.searchParams.get("firma") ?? "";
  const to = request.nextUrl.searchParams.get("til") ?? "/dashboard";
  // Kun interne stier (ikke "//andet-domæne.dk").
  const target = to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard";

  const memberships = await getMemberships(user.id);
  if (memberships.some((m) => m.id === ws)) {
    (await cookies()).set(WORKSPACE_COOKIE, ws, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  redirect(target);
}
