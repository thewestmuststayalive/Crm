import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

type Purpose = "RESET" | "INVITE";

export const TOKEN_TTL: Record<Purpose, number> = {
  RESET: 60 * 60 * 1000, // 1 time
  INVITE: 7 * 24 * 60 * 60 * 1000, // 7 dage
};

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthToken(userId: string, purpose: Purpose) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.authTokens).values({
    tokenHash: hash(token),
    userId,
    purpose,
    expiresAt: new Date(Date.now() + TOKEN_TTL[purpose]),
  });
  return token;
}

/** Antal links oprettet til brugeren den seneste time (bruges til at begrænse misbrug). */
export async function recentTokenCount(userId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.authTokens)
    .where(and(eq(schema.authTokens.userId, userId), gt(schema.authTokens.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
  return n;
}

/** Slår et gyldigt (ubrugt, ikke udløbet) link op uden at bruge det. */
export async function findValidToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db
    .select({
      userId: schema.authTokens.userId,
      purpose: schema.authTokens.purpose,
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.authTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.authTokens.userId))
    .where(
      and(
        eq(schema.authTokens.tokenHash, hash(token)),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Markerer linket som brugt. Returnerer false, hvis det allerede var brugt (fx dobbeltklik). */
export async function consumeToken(token: string) {
  const updated = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.tokenHash, hash(token)), isNull(schema.authTokens.usedAt)))
    .returning({ userId: schema.authTokens.userId });
  return updated.length > 0;
}
