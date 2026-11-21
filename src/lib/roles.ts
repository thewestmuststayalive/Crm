import type { Role } from "@/db/schema";

const RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Ejer",
  ADMIN: "Admin",
  MEMBER: "Medarbejder",
};

export function hasRole(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}
