import type { Metadata } from "next";
import { addStarterReplies, deleteReply } from "@/app/actions/saved-replies";
import { Button, Card, ConfirmButton } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { getSavedReplies } from "@/lib/saved-replies";
import { SavedReplyForm } from "./reply-form";

export const metadata: Metadata = { title: "Svarskabeloner" };

export default async function SavedRepliesPage() {
  const { workspace } = await requireWorkspace();
  const isAdmin = hasRole(workspace.role, "ADMIN");
  const replies = await getSavedReplies(workspace.id);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Faste svar, der kan sættes ind med ét klik i indbakken. {"{navn}"} bliver til kundens fornavn og {"{firma}"} til
        jeres firmanavn.
      </p>
      {replies.length === 0 && isAdmin && (
        <Card title="Kom hurtigt i gang" description="Læg tre almindelige svar ind, som I kan rette til.">
          <form action={addStarterReplies}>
            <Button type="submit" variant="secondary">
              Tilføj standardsvar
            </Button>
          </form>
        </Card>
      )}
      <ul className="space-y-4" aria-label="Svarskabeloner">
        {replies.map((r) => (
          <li key={r.id} aria-label={`Skabelon ${r.title}`}>
            <Card title={r.title}>
              {isAdmin ? (
                <div className="space-y-3">
                  <SavedReplyForm initial={{ id: r.id, title: r.title, body: r.body }} />
                  <form action={deleteReply}>
                    <input type="hidden" name="id" value={r.id} />
                    <ConfirmButton className="px-2.5 py-1 text-xs" message={`Slet "${r.title}"?`}>
                      Slet
                    </ConfirmButton>
                  </form>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-line text-slate-700">{r.body}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      {isAdmin && (
        <Card title="Ny skabelon">
          <SavedReplyForm />
        </Card>
      )}
    </div>
  );
}
