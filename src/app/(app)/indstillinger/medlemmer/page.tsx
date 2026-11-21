import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { changeRole, removeMember, resendInvite } from "@/app/actions/members";
import { Button, Card, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { roleEnum } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { hasRole, ROLE_LABELS } from "@/lib/roles";
import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = { title: "Medlemmer" };

export default async function MembersPage() {
  const { user, workspace } = await requireWorkspace();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const isOwner = workspace.role === "OWNER";
  const emailEnabled = isEmailConfigured();

  const members = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.workspaceId, workspace.id))
    .orderBy(asc(schema.users.name));

  const assignable = roleEnum.enumValues.filter((r) => isOwner || r !== "OWNER");

  return (
    <div className="space-y-6">
      <Card title={`Medlemmer i ${workspace.name}`}>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => {
            // Admins kan ikke ændre ejere, og ingen kan ændre sig selv her.
            const editable = isAdmin && m.id !== user.id && (isOwner || m.role !== "OWNER");
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {m.name} {m.id === user.id && <span className="text-slate-400">(dig)</span>}
                  </p>
                  <p className="truncate text-sm text-slate-500">{m.email}</p>
                </div>
                {editable ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={changeRole} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={m.id} />
                      <Select name="role" defaultValue={m.role} aria-label={`Rolle for ${m.name}`}>
                        {assignable.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                      <Button variant="secondary" type="submit">
                        Gem
                      </Button>
                    </form>
                    {emailEnabled && (
                      <form action={resendInvite}>
                        <input type="hidden" name="userId" value={m.id} />
                        <Button variant="secondary" type="submit" title="Send et nyt link til at vælge adgangskode">
                          Send invitation igen
                        </Button>
                      </form>
                    )}
                    <form action={removeMember}>
                      <input type="hidden" name="userId" value={m.id} />
                      <Button variant="danger" type="submit">
                        Fjern
                      </Button>
                    </form>
                  </div>
                ) : (
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {isAdmin && (
        <Card
          title="Tilføj medlem"
          description={
            emailEnabled
              ? "Personen får en e-mail med et link til at vælge sin egen adgangskode. Har personen allerede en konto, får vedkommende blot adgang til dette firma."
              : "Opret en konto med en midlertidig adgangskode, som personen selv ændrer under Min profil. Har personen allerede en konto, får vedkommende blot adgang til dette firma."
          }
        >
          <AddMemberForm roles={assignable.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} emailEnabled={emailEnabled} />
        </Card>
      )}
    </div>
  );
}
