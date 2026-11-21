import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

const upcoming = [
  { title: "Pipeline og opgaver", text: "Deals i faser og opfølgninger med deadline.", phase: 3 },
  { title: "Leads fra kontaktformular", text: "Henvendelser fra dine hjemmesider lander direkte her.", phase: 4 },
  { title: "Meta Ads", text: "Leads fra Lead Ads og annonceforbrug pr. kampagne.", phase: 5 },
  { title: "Indbakke", text: "Beskeder fra Messenger og Instagram samlet ét sted.", phase: 6 },
];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, workspace } = await requireWorkspace();
  const { fejl } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Hej {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-500">Du arbejder i {workspace.name}.</p>
      </header>

      {fejl === "adgang" && (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Du har ikke adgang til den side i dette firma.
        </p>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">På vej</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((item) => (
            <li key={item.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-400">Fase {item.phase}</p>
              <p className="mt-1 font-medium text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
