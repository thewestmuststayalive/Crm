import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { getMemberships, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Opret firma" };

/** Vises når en bruger ikke længere er medlem af noget firma. */
export default async function CreateFirstWorkspacePage() {
  const user = await requireUser();
  if ((await getMemberships(user.id)).length > 0) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Du har ikke adgang til noget firma</h1>
        <p className="mt-1 text-sm text-slate-500">
          Opret et nyt firma, eller bed en administrator om at tilføje dig.
        </p>
        <div className="mt-4">
          <CreateWorkspaceForm />
        </div>
        <form action={logout} className="mt-4">
          <button className="text-sm text-slate-500 underline">Log ud</button>
        </form>
      </div>
    </main>
  );
}
