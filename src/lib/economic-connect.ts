import "server-only";
import { db, schema } from "@/db";
import { audit } from "./audit";
import { encrypt } from "./crypto";
import { getSelf } from "./economic";

/** Gemmer forbindelsen til firmaets e-conomic-aftale efter at have tjekket tokenet hos e-conomic. */
export async function connectEconomic(workspaceId: string, userId: string, token: string) {
  const self = await getSelf(token);
  const values = {
    grantTokenEnc: encrypt(token),
    agreementNumber: self.agreementNumber,
    companyName: self.companyName,
    planLevel: self.planLevel,
    connectedById: userId,
  };
  await db
    .insert(schema.economicConnections)
    .values({ workspaceId, ...values })
    .onConflictDoUpdate({ target: schema.economicConnections.workspaceId, set: values });
  await audit(workspaceId, userId, "Forbandt e-conomic", `${self.companyName ?? ""} (aftale ${self.agreementNumber})`);
  return self;
}
