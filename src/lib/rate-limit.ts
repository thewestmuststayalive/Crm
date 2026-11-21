import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gt, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";

// Begrænsning af loginforsøg: højst 5 forkerte pr. e-mail og 20 pr. IP-adresse pr. 15 minutter.
const WINDOW = sql`now() - interval '15 minutes'`;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

async function ipHash() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "ukendt";
  return createHash("sha256").update(`login:${ip}`).digest("hex");
}

export async function isLoginBlocked(email: string) {
  const ip = await ipHash();
  const [[byEmail], [byIp]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.loginAttempts)
      .where(and(eq(schema.loginAttempts.email, email), gt(schema.loginAttempts.createdAt, WINDOW))),
    db
      .select({ n: count() })
      .from(schema.loginAttempts)
      .where(and(eq(schema.loginAttempts.ipHash, ip), gt(schema.loginAttempts.createdAt, WINDOW))),
  ]);
  return byEmail.n >= MAX_PER_EMAIL || byIp.n >= MAX_PER_IP;
}

export async function recordFailedLogin(email: string) {
  await db.insert(schema.loginAttempts).values({ email, ipHash: await ipHash() });
  // Ryd op i gamle forsøg, så tabellen ikke vokser.
  await db.delete(schema.loginAttempts).where(lt(schema.loginAttempts.createdAt, sql`now() - interval '1 day'`));
}

export async function clearFailedLogins(email: string) {
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.email, email));
}
